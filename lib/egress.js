// lib/egress.js - v1.5: optional egress control so the addon can scrape from
// somewhere other than Render's datacenter IP.
//
// WHY THIS EXISTS ("make all scrapers work like nv-plugin"): the pack's
// scrapers run ON THE USER'S DEVICE, so every upstream sees a residential
// IP and answers. The addon runs on Render, where a growing set of upstreams
// block datacenter IPs outright (kisskh mirrors, xpass embed, vidrock API,
// apibay/1337x for tagalogtorrents, miruro's pipe, cinemacity, moviebox API
// and more) or answer with Cloudflare challenges. No amount of header work
// fixes that class - the requests must LEAVE from a different IP. v1.5 adds
// two opt-in egress routes (both transparent to the 42 provider files):
//
//   RELAY_URL  - a self-hosted Cloudflare Worker relay (see
//                addons/stream-relay/): the addon rewrites each upstream
//                request to <RELAY_URL>?u=<target>&h=<headers>&m=<method>&b=<body>
//                and the worker fetches it from Cloudflare's egress. Free,
//                2-minute deploy, same infra users already run for
//                asian-catalog. Optional RELAY_KEY shared secret.
//   PROXY_URL  - a standard HTTP(S) proxy, e.g. http://user:pass@host:port,
//                routed through the vendored `undici` ProxyAgent (real
//                streaming Response, full transparency).
//
// DESIGN RULES (mirroring the v1.4 config safety rules):
//   - NO provider file is modified and NO global config is mutated. A
//     request's egress rides the same cfg object as the debrid fields and
//     reaches this module through AsyncLocalStorage, so concurrent requests
//     with different egress configs cannot bleed into each other.
//   - Relay is used only for the upstream hop. api.themoviedb.org (the
//     backbone every scraper depends on), the addon's own host (keep-warm
//     pings) and the relay host itself always go direct.
//   - A relay request that THROWS (network error, worker down) falls back to
//     a direct attempt once. HTTP error statuses (403/503/...) are the
//     upstream's answer and pass through untouched - the relay never hides
//     what a site really said. Relay-protocol errors (bad key, bad params)
//     are marked x-relay-error by the worker and also fall back.
//   - Cache lines are shared between direct and relay variants on purpose:
//     the same upstream URL returns the same rows through either path, so
//     egress is NOT part of the stream cache key (only the debrid fields
//     are - see runner cfgKeyOf).
//   - All log lines redact credentials: proxy userinfo and relay keys never
//     appear in Render logs or the status page.

"use strict";

const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

// Vendored zero-build dependency (node_modules/undici) - used ONLY when a
// PROXY_URL is configured. The relay path needs nothing but global fetch.
let undici = null;
try { undici = require("undici"); } catch (_) { undici = null; }
const proxyAgents = new Map(); // proxyUrl -> ProxyAgent (reused across requests)

function proxyAgentFor(proxyUrl) {
  if (!undici || typeof undici.ProxyAgent !== "function") return null;
  let agent = proxyAgents.get(proxyUrl);
  if (!agent) {
    try {
      agent = new undici.ProxyAgent({ uri: proxyUrl });
    } catch (e) {
      console.error(`[egress] bad PROXY_URL: ${e && e.message}`);
      agent = null;
    }
    if (agent) proxyAgents.set(proxyUrl, agent);
  }
  return agent;
}

// ---- config ----------------------------------------------------------------

function envEgress() {
  const proxy = (process.env.PROXY_URL || "").trim();
  const relay = (process.env.RELAY_URL || "").trim();
  const relayKey = (process.env.RELAY_KEY || "").trim();
  if (proxy) return { proxyUrl: proxy };
  if (relay) return { relayUrl: relay, relayKey };
  return null;
}

function currentEgress() {
  // request-level cfg wins over env; within one level, proxy beats relay
  const store = als.getStore();
  const eg = store && store.egress;
  if (eg && (eg.proxyUrl || eg.relayUrl)) return eg;
  return envEgress();
}

// parseEgressConfig(searchParams, rawPathname) -> {relayUrl, relayKey?, proxyUrl?} | null
//   query: ?relay=<url[%7Ckey]>            ?proxy=<url>
//   path:  /relay=<enc(url|key)>/...       /proxy=<enc(url)>/...
// (the path value arrives percent-encoded because it must not contain a raw "/")
function parseEgressConfig(searchParams, rawPathname) {
  let relay = null;
  let proxy = null;
  try { relay = searchParams.get("relay"); } catch (_) { relay = null; }
  try { proxy = searchParams.get("proxy"); } catch (_) { proxy = null; }
  if (relay == null && proxy == null) {
    const m = String(rawPathname || "").match(/^\/(relay|proxy)=([^/]+)\//i);
    if (m) {
      let v = m[2];
      try { v = decodeURIComponent(v); } catch (_) { /* keep raw */ }
      if (m[1].toLowerCase() === "relay") relay = v;
      else proxy = v;
    }
  }
  const eg = {};
  if (relay) {
    const parts = String(relay).split("|");
    const u = (parts[0] || "").trim();
    if (/^https?:\/\//i.test(u)) {
      eg.relayUrl = u;
      const k = (parts[1] || "").trim();
      if (k) eg.relayKey = k;
    }
  }
  if (proxy) {
    const u = String(proxy).trim();
    if (/^https?:\/\//i.test(u)) eg.proxyUrl = u;
  }
  return (eg.relayUrl || eg.proxyUrl) ? eg : null;
}

// merge debrid fields (parsed in server.js) and egress fields into ONE cfg
function mergeConfigs(debridCfg, egressCfg) {
  if (!debridCfg && !egressCfg) return null;
  const cfg = {};
  if (debridCfg) {
    cfg.provider = debridCfg.provider;
    cfg.key = debridCfg.key;
  }
  if (egressCfg) cfg.egress = egressCfg;
  return cfg;
}

// config tag for manifest ids / headers / logs. Debrid-only cfgs keep the
// v1.4 format ("provider-hash6"); egress-only cfgs get "eg-hash6" so a relay
// variant of the addon is a distinct addon in Nuvio's list. Egress is NOT
// part of the runner's cache key (same upstream content either way).
function computeConfigTag(cfg) {
  if (!cfg) return "plain";
  if (cfg.provider) {
    let h = 0;
    const s = String(cfg.provider) + ":" + String(cfg.key || "");
    for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
    return String(cfg.provider) + "-" + h.toString(36).slice(0, 6);
  }
  if (cfg.egress) {
    const e = cfg.egress;
    const s = "eg:" + (e.proxyUrl || "") + "|" + (e.relayUrl || "") + "|" + (e.relayKey || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
    return "eg-" + h.toString(36).slice(0, 6);
  }
  return "plain";
}

// ---- redaction (credentials never reach logs / status page) -----------------

function redactUrl(u) {
  try {
    const p = new URL(u);
    if (p.username || p.password) {
      p.username = p.username ? "***" : "";
      p.password = p.password ? "***" : "";
    }
    return p.toString();
  } catch (_) {
    return "(bad url)";
  }
}

function describeEgress(eg) {
  if (!eg) return { mode: "direct" };
  if (eg.proxyUrl) return { mode: "proxy", target: redactUrl(eg.proxyUrl) };
  return { mode: "relay", target: redactUrl(eg.relayUrl), keyed: !!eg.relayKey };
}

function egressStats() {
  return {
    request: describeEgress(currentEgress()),
    undiciAvailable: !!undici,
  };
}

// ---- fetch plumbing ----------------------------------------------------------

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch (_) { return ""; }
}

function isExemptHost(host) {
  return (
    host === "api.themoviedb.org" ||
    host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
    host === "[::1]" || exemptSelf.has(host)
  );
}

const exemptSelf = new Set(); // addon's own host(s) - keep-warm pings stay direct

function headersToObject(h) {
  try {
    if (h && typeof h.forEach === "function") {
      const o = {};
      h.forEach((v, k) => { o[k] = v; });
      return o;
    }
    if (Array.isArray(h)) {
      const o = {};
      for (const kv of h) { if (Array.isArray(kv) && kv.length >= 2) o[kv[0]] = String(kv[1]); }
      return o;
    }
    if (h && typeof h === "object") return Object.assign({}, h);
  } catch (_) { /* fall through */ }
  return {};
}

function b64url(v) {
  return Buffer.from(v).toString("base64url");
}

// build the relay request URL, or null when the body type cannot ride a query
// param (ReadableStream / FormData / Blob) - those fall back to direct
function relayRewrite(targetUrl, opts, eg) {
  const u = new URL(eg.relayUrl);
  u.searchParams.set("u", targetUrl);
  const method = ((opts && opts.method) || "GET").toUpperCase();
  if (method !== "GET") u.searchParams.set("m", method);
  const headers = headersToObject(opts && opts.headers);
  delete headers["host"];
  delete headers["content-length"];
  delete headers["connection"];
  const hKeys = Object.keys(headers);
  if (hKeys.length) u.searchParams.set("h", b64url(JSON.stringify(headers)));
  let body = opts && opts.body;
  if (body != null && method !== "GET" && method !== "HEAD") {
    if (typeof body === "string") {
      u.searchParams.set("b", b64url(body));
    } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      u.searchParams.set("b", b64url(body));
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      u.searchParams.set("b", b64url(Buffer.from(body)));
    } else if (body && typeof body.toString === "function" &&
               (body instanceof URLSearchParams || typeof body.pipe !== "function")) {
      // URLSearchParams and other stringifiable bodies (but not streams)
      u.searchParams.set("b", b64url(body.toString()));
    } else {
      return null; // unrelayable body type -> caller falls back to direct
    }
  }
  if (eg.relayKey) u.searchParams.set("k", eg.relayKey);
  return u.toString();
}

async function relayFetch(targetUrl, opts, eg, baseFetch) {
  const relayUrl = relayRewrite(targetUrl, opts, eg);
  if (!relayUrl) return baseFetch(targetUrl, opts);
  try {
    const res = await baseFetch(relayUrl, {
      method: "GET",
      headers: { "accept": "*/*" },
      signal: opts && opts.signal,
    });
    // the worker marks ITS OWN errors (bad key / bad params) with a header;
    // everything else - including upstream 403/5xx - is the real answer
    if (res.headers && res.headers.get("x-relay-error")) {
      const msg = await res.text().catch(() => "");
      console.error(`[egress] relay ${redactUrl(eg.relayUrl)} rejected ${hostOf(targetUrl)}: ` +
        `${res.status} ${msg.slice(0, 120)} - direct fallback`);
      return baseFetch(targetUrl, opts);
    }
    return res;
  } catch (e) {
    if (opts && opts.signal && opts.signal.aborted) {
      const err = new Error("aborted before relay fallback");
      err.name = "AbortError";
      throw err;
    }
    console.error(`[egress] relay ${redactUrl(eg.relayUrl)} failed for ${hostOf(targetUrl)}: ` +
      `${e && e.message} - direct fallback`);
    return baseFetch(targetUrl, opts);
  }
}

async function proxyFetch(targetUrl, opts, eg, baseFetch) {
  const agent = proxyAgentFor(eg.proxyUrl);
  if (!agent) {
    console.error("[egress] undici/ProxyAgent unavailable - PROXY_URL ignored, going direct");
    return baseFetch(targetUrl, opts);
  }
  if (undici && typeof undici.fetch === "function") {
    return undici.fetch(targetUrl, Object.assign({}, opts || {}, { dispatcher: agent }));
  }
  return baseFetch(targetUrl, opts);
}

// runWithEgress(eg, fn) - run fn (and everything it awaits) with a request-
// level egress config. Used by the runner so a per-URL config reaches this
// module without touching any provider file or global.
function runWithEgress(eg, fn) {
  if (!eg) return als.run({}, fn);
  return als.run({ egress: eg }, fn);
}

function installEgressFetch(selfUrls) {
  const prevFetch = global.fetch; // = runner's tmdbAwareFetch (or plain fetch)
  if (prevFetch && prevFetch.__nvioEgress) return; // idempotent
  for (const u of selfUrls || []) {
    const h = hostOf(u);
    if (h) exemptSelf.add(h);
  }
  function egressAwareFetch(url, opts) {
    let target = null;
    try {
      target = typeof url === "string" ? url : (url && url.url) || null;
    } catch (_) { target = null; }
    if (!target || !/^https?:\/\//i.test(target)) return prevFetch(url, opts);
    let eg = null;
    try { eg = currentEgress(); } catch (_) { eg = null; }
    if (!eg) return prevFetch(url, opts);
    const host = hostOf(target);
    if (!host || isExemptHost(host)) return prevFetch(url, opts);
    if (eg.relayUrl && host === hostOf(eg.relayUrl)) return prevFetch(url, opts);
    try {
      if (eg.proxyUrl) return proxyFetch(target, opts, eg, prevFetch);
      if (eg.relayUrl) return relayFetch(target, opts, eg, prevFetch);
    } catch (e) {
      console.error(`[egress] route error for ${host}: ${e && e.message} - direct`);
    }
    return prevFetch(url, opts);
  }
  egressAwareFetch.__nvioEgress = true;
  global.fetch = egressAwareFetch;
  const d = describeEgress(envEgress());
  console.log(`[egress] installed (default: ${d.mode}` +
    (d.target ? ` -> ${d.target}` : "") +
    `; undici ${undici ? "available" : "absent - PROXY_URL disabled"}; ` +
    "per-URL cfg overrides via ?relay=/?proxy=)");
}

module.exports = {
  installEgressFetch,
  runWithEgress,
  parseEgressConfig,
  mergeConfigs,
  computeConfigTag,
  egressStats,
  redactUrl,
  describeEgress,
  hostOf,
  isExemptHost,
  // test hooks
  __test: { relayRewrite, headersToObject, b64url, envEgress },
};
