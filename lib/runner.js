// lib/runner.js - loads every nv-plugins scraper and fans one stream request
// out to all of them in parallel.
//
// The provider files are the EXACT JS files the Nuvio app runs in its QuickJS
// runtime. On Node >= 18 every global they touch exists natively (fetch,
// atob/btoa, URLSearchParams, TextDecoder, timers, AbortController), so they
// are loaded with plain require() - no sandboxing needed. Each file was
// already device-hardened in the pack (guarded timeouts everywhere, so a
// black-holed upstream can never wedge the server).
//
// SPEED MODEL (v1.1) - why requests now answer in seconds, not 20:
//  1. EARLY EXIT: the aggregate responds as soon as ENOUGH rows have landed
//     (EARLY_ROWS after EARLY_MIN_MS), instead of waiting for the dozen
//     always-slow scrapers to hit the cap. A second MID_MIN_MS checkpoint
//     answers sparse requests (~9s) that hold at least one row instead of
//     sitting on the deadline, and the deadline now defaults to 15s.
//  2. STREAM CACHE: identical requests (same type/id/season/episode) return
//     instantly from an in-memory TTL cache. Nuvio asks for the same id
//     repeatedly (detail screen + play + retries).
//  3. IN-FLIGHT DEDUP: concurrent identical requests share one fan-out.
//  4. STALE-WHILE-REVALIDATE: an expired cache entry is served immediately
//     while a background refresh runs.
//  5. TMDB COALESCE: every scraper resolves its own TMDB metadata first, so
//     one fan-out used to fire ~35 identical api.themoviedb.org calls at
//     once. A transparent fetch shim collapses them into one round trip and
//     caches responses for TMDB_CACHE_TTL_MS.
//  6. FULL CACHE COMPLETION: rows that land after the early answer used to
//     be thrown away; now a background pass folds them into the cache entry,
//     so re-opening the same title returns the complete set instantly.
//  7. TRUTHFUL LOGS: per-scraper cap timers are cleared when a scraper
//     finishes, so a "timeout (rows dropped)" line now means exactly that.
//  8. EMPTY-CACHE HARDENING (v1.3): a 0-row aggregate is cached only for a
//     short window (ZERO_ROW_TTL_MS, 90s) instead of the full stream TTL, an
//     expired empty entry is re-fanned-out synchronously instead of being
//     served stale, and a background refresh that lands 0 rows can never
//     clobber a good entry. One bad fan-out no longer poisons a title.
// Safety rules (learned from the pack's device-killer history) unchanged:
// every provider call is raced against a hard cap that RESOLVES to [] (never
// rejects, never wedges), throws become [], rows deduped by URL and capped.

"use strict";

// v1.2: device globals (CryptoJS, SCRAPER_SETTINGS) MUST exist before any
// provider file is require()d - see lib/device-globals.js for the why.
require("./device-globals").installDeviceGlobals();

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// v1.2: torrent lanes are ON by default (user request). Rows come out as
// magnet: urls (+ infoHash/fileIdx/sources passthrough) which Nuvio / NuvioTV
// resolve with their own debrid accounts or built-in P2P engine. Set
// SKIP_PROVIDERS=torrents,tagalogtorrents to go back to direct/HLS-only.
const SKIP_PROVIDERS = new Set(
  (process.env.SKIP_PROVIDERS || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
);
const PROVIDER_TIMEOUT_MS = parseInt(process.env.PROVIDER_TIMEOUT_MS || "15000", 10);
const MAX_ROWS = parseInt(process.env.MAX_ROWS || "100", 10);
const TMDB_API_KEY = process.env.TMDB_API_KEY || "307b7b8ef035c6aa336900aef4e203bd";
const TMDB_LANG = process.env.TMDB_LANG || "en";

// early-exit knobs (v1.0.1, retuned + mid checkpoint in v1.1)
const RESPONSE_DEADLINE_MS = parseInt(process.env.RESPONSE_DEADLINE_MS || String(PROVIDER_TIMEOUT_MS), 10);
const EARLY_MIN_MS = parseInt(process.env.EARLY_MIN_MS || "4000", 10);
const EARLY_ROWS = parseInt(process.env.EARLY_ROWS || "6", 10);
const EARLY_DONE_PROVIDERS = parseInt(process.env.EARLY_DONE_PROVIDERS || "20", 10);
const MID_MIN_MS = parseInt(process.env.MID_MIN_MS || "9000", 10);

// tmdb shim knobs (v1.1)
const TMDB_CACHE_TTL_MS = parseInt(process.env.TMDB_CACHE_TTL_MS || "600000", 10);
const TMDB_CACHE_MAX = parseInt(process.env.TMDB_CACHE_MAX || "500", 10);

// cache knobs (v1.0.1, empty-entry hardening in v1.3)
const STREAM_CACHE_TTL_MS = parseInt(process.env.STREAM_CACHE_TTL_MS || "1800000", 10);
const CACHE_MAX = parseInt(process.env.CACHE_MAX || "300", 10);
// v1.3: a 0-row aggregate is cached only briefly. Before this, ONE bad fan-out
// (deploy restart, cold TMDB, momentary upstream flap) poisoned the title with
// an instant-empty cache hit for the FULL 30min TTL - the reported "scrapers
// not giving streams" where every retry stayed empty no matter what.
const ZERO_ROW_TTL_MS = parseInt(process.env.ZERO_ROW_TTL_MS || "90000", 10);

// ---- TMDB fetch shim (v1.1) ----------------------------------------------
// Every scraper resolves its own TMDB metadata (title/year/imdb ids) at the
// top of its chain, so one fan-out fired ~35 CONCURRENT, largely identical
// api.themoviedb.org calls. This shim is transparent: GETs to
// api.themoviedb.org are coalesced while in flight and cached for
// TMDB_CACHE_TTL_MS; callers keep receiving a real Response
// (status/ok/json/text all intact).
const origFetch = global.fetch;
const tmdbTextCache = new Map(); // url -> { at, status, ct, text }
const tmdbInflight = new Map();  // url -> Promise<{ at, status, ct, text }>

function tmdbResponseFrom(rec) {
  return new Response(rec.text, {
    status: rec.status,
    headers: { "content-type": rec.ct },
  });
}

async function tmdbCoalescedFetch(url) {
  const hit = tmdbTextCache.get(url);
  if (hit && Date.now() - hit.at <= TMDB_CACHE_TTL_MS) {
    return tmdbResponseFrom(hit);
  }
  if (hit) tmdbTextCache.delete(url); // stale
  let p = tmdbInflight.get(url);
  if (!p) {
    p = (async () => {
      // Caller opts are intentionally NOT forwarded: a shared in-flight call
      // must not be abortable by a single caller (TMDB GETs carry their auth
      // in the URL). The underlying call gets its own 10s abort so a black-
      // holed TMDB can never wedge imdbToTmdb or a scraper chain; the
      // per-provider runner cap bounds everything else.
      const signal = (typeof AbortSignal !== "undefined" && AbortSignal.timeout)
        ? AbortSignal.timeout(10000)
        : undefined;
      const res = await origFetch(url, { signal });
      const text = await res.text();
      const rec = {
        at: Date.now(),
        status: res.status,
        ct: res.headers.get("content-type") || "application/json; charset=utf-8",
        text,
      };
      if (res.ok && text) {
        tmdbTextCache.set(url, rec);
        while (tmdbTextCache.size > TMDB_CACHE_MAX) {
          tmdbTextCache.delete(tmdbTextCache.keys().next().value);
        }
      }
      return rec;
    })().finally(() => tmdbInflight.delete(url));
    tmdbInflight.set(url, p);
  }
  return tmdbResponseFrom(await p);
}

global.fetch = function tmdbAwareFetch(url, opts) {
  try {
    const u = typeof url === "string" ? url : (url && url.url) || "";
    const method = opts && opts.method ? String(opts.method).toUpperCase() : "GET";
    if (method === "GET" && typeof u === "string" &&
        u.startsWith("https://api.themoviedb.org/")) {
      return tmdbCoalescedFetch(u);
    }
  } catch (_) { /* never let the shim break a call */ }
  return origFetch.call(global, url, opts);
};

const providers = []; // { id, name, types:Set<"movie"|"tv">, getStreams }
const loadErrors = [];
let startedAt = Date.now();

function normalizeType(t) {
  // pack manifests use "movie"/"tv"; some clients say "series"
  const v = String(t || "").toLowerCase();
  if (v === "series" || v === "show" || v === "tv_show" || v === "tvshow") return "tv";
  if (v === "movie" || v === "tv") return v;
  return null;
}

function loadProviders() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  for (const entry of manifest.scrapers || []) {
    const base = String(entry.filename || "").split("/").pop();
    if (!base.endsWith(".js")) continue;
    if (SKIP_PROVIDERS.has(entry.id)) {
      console.log(`[runner] skip ${entry.id} (env SKIP_PROVIDERS)`);
      continue;
    }
    const file = path.join(ROOT, "providers", base);
    if (!fs.existsSync(file)) {
      loadErrors.push(`${entry.id}: file missing (${base})`);
      console.error(`[runner] load fail ${entry.id}: file missing`);
      continue;
    }
    try {
      const mod = require(file);
      if (typeof mod.getStreams !== "function") throw new Error("no getStreams export");
      const types = new Set(
        (entry.supportedTypes || ["movie", "tv"]).map(normalizeType).filter(Boolean)
      );
      providers.push({
        id: entry.id,
        name: entry.name || entry.id,
        types,
        isTorrent: entry.id === "torrents" || entry.id === "tagalogtorrents",
        getStreams: mod.getStreams,
      });
    } catch (e) {
      loadErrors.push(`${entry.id}: ${e.message}`);
      console.error(`[runner] load fail ${entry.id}: ${e.message}`);
    }
  }
  const torrentLanes = providers.filter((p) => p.isTorrent).map((p) => p.id);
  console.log(`[runner] loaded ${providers.length} providers ` +
    `(torrent lanes on: ${torrentLanes.join(", ") || "none"}` +
    `${SKIP_PROVIDERS.size ? "; skipped: " + [...SKIP_PROVIDERS].join(", ") : ""}) ` +
    `early-exit: respond after ${EARLY_MIN_MS}ms once ${EARLY_ROWS}+ rows ` +
    `or ${EARLY_DONE_PROVIDERS}+ done, mid ${MID_MIN_MS}ms, ` +
    `deadline ${RESPONSE_DEADLINE_MS}ms`);
}

// Race any promise against a hard cap that RESOLVES to [] (never rejects).
// The cap wraps the WHOLE chain: a provider promise that hangs forever must
// still lose the race (racing after .then() would never fire the timer's
// result - the exact hang class the pack's device-killer fixes removed).
// v1.1: the cap timer is DISARMED as soon as the real work settles, so a
// scraper that finished in 4s no longer logs a bogus "timeout ... rows
// dropped" line when the cap fires at 15s; only genuine stragglers log it,
// and a scraper that lands rows after its cap says so explicitly.
function withTimeout(promiseFactory, ms, label) {
  let capTimer = null;
  let capped = false;
  const disarm = () => {
    if (capTimer) {
      clearTimeout(capTimer);
      capTimer = null;
    }
  };
  const work = Promise.resolve()
    .then(promiseFactory)
    .then((v) => (Array.isArray(v) ? v : []))
    .catch((e) => {
      console.error(`[runner] ${label} threw: ${e && e.message}`);
      return [];
    })
    .then((rows) => {
      disarm();
      if (capped && rows.length) {
        console.log(`[runner] ${label} finished late with ${rows.length} rows (after cap) - dropped`);
      }
      return rows;
    });
  const cap = new Promise((resolve) => {
    capTimer = setTimeout(() => {
      capped = true;
      console.log(`[runner] timeout ${label} >${ms}ms (rows dropped)`);
      resolve([]);
    }, ms);
    if (capTimer.unref) capTimer.unref();
  });
  return Promise.race([work, cap]).then((rows) => {
    disarm();
    return rows;
  });
}

const sleep = (ms) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  if (t.unref) t.unref();
});

// ---- id resolution -------------------------------------------------------

const imdbCache = new Map(); // "tt123:movie" -> tmdbId | null

async function imdbToTmdb(imdbId, type) {
  const key = `${imdbId}:${type}`;
  if (imdbCache.has(key)) return imdbCache.get(key);
  let out = null;
  try {
    const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}` +
      `?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=${TMDB_LANG}`;
    const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (res.ok) {
      const data = await res.json();
      const pick = type === "tv"
        ? ((data.tv_results || [])[0] || (data.movie_results || [])[0])
        : ((data.movie_results || [])[0] || (data.tv_results || [])[0]);
      if (pick && pick.id) out = String(pick.id);
    }
  } catch (e) {
    console.error(`[runner] imdb lookup failed ${imdbId}: ${e.message}`);
  }
  imdbCache.set(key, out);
  return out;
}

// ---- one uncached fan-out (early exit) ------------------------------------

// v1.2: torrent rows (magnet: urls from the torrents/tagalogtorrents lanes)
// are recognized and expanded into the full Stremio torrent shape:
//   url: "magnet:?xt=urn:btih:<hash>&tr=..."   (Nuvio debrid/P2P path)
//   infoHash + fileIdx + sources:["tracker:..."] + behaviorHints.notWebReady
//     (standard Stremio torrent fields, so any Stremio-compatible client
//     can also pick the row up)
// Dedupe for torrents keys on the infoHash, so the same torrent reported by
// two lanes (or two tracker orderings) collapses to one row.
function torrentFieldsFromMagnet(magnet) {
  const out = { infoHash: null, fileIdx: null, sources: null };
  const h = String(magnet).match(/btih:([a-f0-9]{32,40})/i);
  if (h) out.infoHash = h[1].toLowerCase();
  const ix = String(magnet).match(/[?&]index=(\d+)/);
  if (ix) out.fileIdx = parseInt(ix[1], 10);
  const trs = [];
  const re = /[?&]tr=([^&]+)/g;
  let m;
  while ((m = re.exec(String(magnet))) !== null) {
    try { trs.push("tracker:" + decodeURIComponent(m[1])); } catch (_) { /* skip */ }
  }
  if (trs.length) out.sources = trs;
  return out;
}

function aggregate(settled) {
  const streams = [];
  const seen = new Set();
  let liveProviders = 0;
  for (const s of settled) {
    if (!s) continue;
    let added = 0;
    for (const row of s.rows) {
      if (!row) continue;
      const magnet = typeof row.url === "string" && /^magnet:/i.test(row.url) ? row.url : null;
      const hasUrl = typeof row.url === "string" && row.url && !magnet;
      if (!hasUrl && !magnet && !row.infoHash) continue;
      const dupeKey = magnet && row.infoHash ? "m:" + String(row.infoHash).toLowerCase()
        : magnet ? magnet.slice(0, 80)
        : row.url;
      if (seen.has(dupeKey)) continue;
      seen.add(dupeKey);
      const out = { name: s.name, title: row.title || row.name || s.name };
      if (hasUrl) {
        out.url = row.url;
      } else if (magnet) {
        out.url = magnet;
        const tf = torrentFieldsFromMagnet(magnet);
        if (!tf.infoHash && row.infoHash) tf.infoHash = String(row.infoHash).toLowerCase();
        if (tf.infoHash) {
          out.infoHash = tf.infoHash;
          if (tf.fileIdx != null) out.fileIdx = tf.fileIdx;
          else if (row.fileIdx != null) out.fileIdx = parseInt(row.fileIdx, 10) || null;
          if (tf.sources) out.sources = tf.sources;
          out.behaviorHints = { notWebReady: true };
        }
      } else if (row.infoHash) {
        // infoHash-only row (no magnet built) - pass the hash through
        out.infoHash = String(row.infoHash).toLowerCase();
        if (row.fileIdx != null) out.fileIdx = parseInt(row.fileIdx, 10) || null;
        if (Array.isArray(row.sources) && row.sources.length) {
          out.sources = row.sources.map((x) =>
            typeof x === "string" && /^tracker:|^dht:/i.test(x) ? x : "tracker:" + x);
        }
        out.behaviorHints = { notWebReady: true };
      }
      if (row.quality) out.quality = row.quality;
      // best-effort subtitle passthrough (rows carry it when the lane emits)
      if (Array.isArray(row.subtitles) && row.subtitles.length) {
        out.subtitles = row.subtitles;
      }
      streams.push(out);
      added++;
      if (streams.length >= MAX_ROWS) break;
    }
    if (added) liveProviders++;
    if (streams.length >= MAX_ROWS) break;
  }
  return { streams, liveProviders };
}

async function runAllUncached(type, tmdbId, season, episode) {
  const t0 = Date.now();
  type = normalizeType(type) === "tv" ? "tv" : "movie";
  const pool = providers.filter((p) => p.types.has(type));
  if (type === "tv") {
    // pack convention: providers default to S1E1 when the app omits it
    season = season && /^\d+$/.test(String(season)) ? String(parseInt(season, 10)) : "1";
    episode = episode && /^\d+$/.test(String(episode)) ? String(parseInt(episode, 10)) : "1";
  }

  const settled = new Array(pool.length).fill(undefined);
  let done = 0;
  const total = pool.length;
  const rowsReady = () =>
    settled.reduce((a, s) => a + (s ? s.rows.length : 0), 0);

  const jobs = pool.map((p, i) =>
    withTimeout(
      () => p.getStreams(String(tmdbId), type, season, episode),
      PROVIDER_TIMEOUT_MS,
      p.id
    ).then((rows) => {
      settled[i] = { id: p.id, name: p.name, rows };
      done++;
      if (rows.length) console.log(`[runner] ${p.id}: ${rows.length} rows in ${Date.now() - t0}ms`);
    })
  );

  // Checkpoint polls (v1.1): stop waiting for stragglers when
  //  - early: enough rows landed (or enough providers finished) after the
  //    EARLY_MIN_MS floor, or
  //  - mid: after MID_MIN_MS at least ONE row exists (rescues sparse titles
  //    that used to sit on the deadline with a usable row in hand).
  const makeCheckpoint = (floorMs, cond) => {
    let iv = null;
    const p = new Promise((resolve) => {
      iv = setInterval(() => {
        if (done === total) return; // "complete" wins the race anyway
        if (Date.now() - t0 < floorMs) return;
        if (cond()) resolve();
      }, 200);
      if (iv.unref) iv.unref();
    });
    return { p, clear: () => { if (iv) { clearInterval(iv); iv = null; } } };
  };

  const early = makeCheckpoint(EARLY_MIN_MS, () =>
    rowsReady() >= EARLY_ROWS ||
    (done >= Math.min(EARLY_DONE_PROVIDERS, total) && rowsReady() >= 1)
  );
  const mid = makeCheckpoint(MID_MIN_MS, () => rowsReady() >= 1);

  let why;
  try {
    why = await Promise.race([
      Promise.all(jobs).then(() => "complete"),
      early.p.then(() => "early"),
      mid.p.then(() => "mid"),
      sleep(RESPONSE_DEADLINE_MS).then(() => "deadline"),
    ]);
  } finally {
    early.clear();
    mid.clear();
  }

  const { streams, liveProviders } = aggregate(settled);
  const elapsedMs = Date.now() - t0;
  console.log(`[runner] RESPOND ${type} ${tmdbId} S${season || "-"}E${episode || "-"} ` +
    `(${why}): ${streams.length} rows from ${liveProviders} providers ` +
    `${done}/${total} done in ${elapsedMs}ms`);

  // v1.1: keep harvesting after the answer - when every lane has settled,
  // fold the FULL aggregate into the cache so re-opening this title returns
  // everything (the response itself already went out with the early rows).
  const whenSettled = Promise.all(jobs).then(() => {
    const full = aggregate(settled);
    if (full.streams.length > streams.length) {
      console.log(`[runner] FULL ${type} ${tmdbId}: ${full.streams.length} rows ` +
        `(respond had ${streams.length}) in ${Date.now() - t0}ms`);
    }
    return full;
  });

  return { streams, liveProviders, elapsedMs, whenSettled };
}

// ---- cache + in-flight dedup + stale-while-revalidate ----------------------

const streamCache = new Map(); // key -> { at, streams, liveProviders, empty }
const inflight = new Map(); // key -> Promise<result>

function cacheStore(key, result, opts) {
  const streams = Array.isArray(result.streams) ? result.streams : [];
  // v1.3: never let a transient empty refresh clobber a good entry. A
  // background fold or SWR refresh that lands 0 rows (one flaky upstream
  // window) must not replace a non-empty aggregate; only a caller that
  // explicitly forces (synchronous user-facing retry of an expired entry)
  // may store an empty result over a good one.
  if (!streams.length && !(opts && opts.force)) {
    const prev = streamCache.get(key);
    if (prev && Array.isArray(prev.streams) && prev.streams.length) {
      console.log(`[runner] refresh for ${key} landed 0 rows - kept previous non-empty cache`);
      return prev;
    }
  }
  const entry = {
    at: Date.now(),
    streams,
    liveProviders: result.liveProviders || 0,
    empty: streams.length === 0, // v1.3: zero-row entries get the short TTL
  };
  streamCache.set(key, entry);
  if (streamCache.size > CACHE_MAX) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of streamCache) {
      if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    }
    if (oldestKey) streamCache.delete(oldestKey);
  }
  return entry;
}

// v1.1: after an early/partial answer, complete the cache entry with the
// FULL aggregate once every lane settles - guarded so a newer run for the
// same key is never overwritten by an older run's late completion.
function scheduleCacheCompletion(key, whenSettled, entry) {
  if (!whenSettled || typeof whenSettled.then !== "function") return;
  whenSettled.then((full) => {
    if (streamCache.get(key) !== entry) return; // newer run owns this key now
    cacheStore(key, full);
  }).catch(() => {});
}

async function getStreamsCached(type, tmdbId, season, episode) {
  const key = `${normalizeType(type)}:${tmdbId}:${season || ""}:${episode || ""}`;
  const now = Date.now();
  const hit = streamCache.get(key);

  if (hit) {
    // v1.3: zero-row entries live only ZERO_ROW_TTL_MS so a transient bad
    // fan-out self-heals on the next open instead of poisoning the title
    // for the full 30min stream TTL.
    const ttl = hit.empty ? ZERO_ROW_TTL_MS : STREAM_CACHE_TTL_MS;
    if (now - hit.at <= ttl) {
      return { ...hit, cache: "hit" };
    }
    if (hit.empty) {
      // v1.3: an EXPIRED EMPTY entry is never served stale. Retry the whole
      // fan-out synchronously (in-flight dedup collapses concurrent opens
      // into one retry) so the user gets a real fresh answer instead of an
      // instant empty that sticks around.
      if (inflight.has(key)) {
        const r = await inflight.get(key);
        return { ...r, cache: "dedup-retry" };
      }
      console.log(`[runner] expired EMPTY cache for ${key} - retrying fan-out now`);
      const p = runAllUncached(type, tmdbId, season, episode)
        .then((r) => {
          const entry = cacheStore(key, r, { force: true });
          scheduleCacheCompletion(key, r.whenSettled, entry);
          return r;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      const r = await p;
      return { ...r, cache: "retry-empty" };
    }
    // expired non-empty -> serve stale now, refresh in the background (once).
    // The background store is NOT forced, so a refresh that lands 0 rows in
    // a flaky window can never clobber this good entry.
    if (!inflight.has(key)) {
      const p = runAllUncached(type, tmdbId, season, episode)
        .then((r) => {
          const entry = cacheStore(key, r);
          scheduleCacheCompletion(key, r.whenSettled, entry);
          return r;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      console.log(`[runner] SWR refresh scheduled for ${key}`);
    }
    return { ...hit, cache: "stale" };
  }

  if (inflight.has(key)) {
    const r = await inflight.get(key);
    return { ...r, cache: "dedup" };
  }
  const p = runAllUncached(type, tmdbId, season, episode)
    .then((r) => {
      const entry = cacheStore(key, r, { force: true });
      scheduleCacheCompletion(key, r.whenSettled, entry);
      return r;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  const r = await p;
  return { ...r, cache: "miss" };
}

function stats() {
  return {
    loaded: providers.length,
    ids: providers.map((p) => p.id),
    loadErrors,
    skipped: [...SKIP_PROVIDERS],
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    cacheEntries: streamCache.size,
    cacheTtlSec: Math.round(STREAM_CACHE_TTL_MS / 1000),
    zeroRowTtlSec: Math.round(ZERO_ROW_TTL_MS / 1000),
    tmdbCacheEntries: tmdbTextCache.size,
    tmdbCacheTtlSec: Math.round(TMDB_CACHE_TTL_MS / 1000),
    earlyMinMs: EARLY_MIN_MS,
    earlyRows: EARLY_ROWS,
    midMinMs: MID_MIN_MS,
  };
}

module.exports = { loadProviders, getStreamsCached, stats, imdbToTmdb, normalizeType };
