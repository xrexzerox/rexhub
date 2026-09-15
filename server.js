#!/usr/bin/env node
// server.js - NVio All Streams: a zero-dependency Stremio-protocol addon that
// turns the whole nv-plugins scraper pack into ONE addon for Nuvio / NuvioTV.
//
//   GET /manifest.json                 -> addon manifest (stream resource)
//   GET /stream/movie/{id}.json        -> merged rows from every scraper
//   GET /stream/series/{id:s:e}.json   -> id = tmdb:123 | tt123 | bare 123
//   GET /healthz                       -> liveness for Render
//   GET /                              -> status page (loaded providers)
//
// Run: node server.js   (PORT env is set by Render/Docker; default 10000)

"use strict";

const http = require("http");
const { loadProviders, getStreamsCached, stats, imdbToTmdb } = require("./lib/runner");

const PORT = parseInt(process.env.PORT || "10000", 10);
const ADDON_ID = process.env.ADDON_ID || "community.nvio.all";
const VERSION = process.env.ADDON_VERSION || "1.1.0";
const ADDON_NAME = process.env.ADDON_NAME || "NVio All Streams";
const HOST = process.env.RENDER_EXTERNAL_URL || ""; // Render injects this

loadProviders();

function json(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function manifest() {
  return {
    id: ADDON_ID,
    version: VERSION,
    name: ADDON_NAME,
    description:
      `One addon, every scraper: merges direct streams from ${stats().loaded} ` +
      `nv-plugins sources (KissKH, Pencuri, VidFast, 4KHDHub, VidKing, NetMirror, ` +
      `AsianHub, PinoyMoviesHub and more). Torrent lanes are not included - ` +
      `direct/HLS lanes only.`,
    logo: "https://raw.githubusercontent.com/" + "nv-plugins/main/README.md", // harmless if 404s
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tmdb", "tt"],
    behaviorHints: { configurable: false },
  };
}

// ---- request id parsing --------------------------------------------------
// Accepts: tmdb:969681 | tmdb:125988:1:1 | tt1375666 | tt5491994:1:1 | 969681
// Returns { id, season, episode } or null.
function parseStreamId(raw, isSeries) {
  let s = String(raw || "").trim();
  const tokens = s.split(":").map((t) => t.trim()).filter(Boolean);
  let id = null;
  let imdb = false;
  if (!tokens.length) return null;
  if (/^(tmdb)$/i.test(tokens[0]) && tokens.length >= 2) {
    tokens.shift();
    id = tokens.shift();
  } else if (/^(tt)$/i.test(tokens[0]) && tokens.length >= 2) {
    // rare "tt:5491994" shape - normalize to tt5491994
    tokens.shift();
    id = "tt" + tokens.shift();
    imdb = true;
  } else {
    id = tokens.shift();
    if (/^tt\d+$/i.test(id)) imdb = true;
  }
  if (!/^\d+$/.test(id) && !imdb) return null;
  let season = null;
  let episode = null;
  if (tokens.length >= 2 && /^\d+$/.test(tokens[0]) && /^\d+$/.test(tokens[1])) {
    [season, episode] = tokens;
  }
  void isSeries;
  return { id, imdb, season, episode };
}

// ---- status page -----------------------------------------------------------
function statusPage(res) {
  const st = stats();
  const rows = st.ids
    .map((id) => `<code>${id}</code>`)
    .join(" · ");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><title>${ADDON_NAME}</title></head>
<body style="font-family:sans-serif;max-width:760px;margin:40px auto;color:#222">
<h1>${ADDON_NAME} <small style="color:#888">v${VERSION}</small></h1>
<p>Addon URL for Nuvio / NuvioTV:<br><b>${HOST || "http://localhost:" + PORT}/manifest.json</b></p>
<p><b>${st.loaded}</b> scrapers loaded · uptime ${st.uptimeSec}s · stream cache: ${st.cacheEntries} entries (TTL ${st.cacheTtlSec}s) · tmdb cache: ${st.tmdbCacheEntries} entries</p>
<p style="color:#888">torrent lanes skipped: ${st.skipped.join(", ")}</p>
<p>${rows}</p>
${st.loadErrors.length ? "<p style='color:#b00'>load errors: " + st.loadErrors.join("; ") + "</p>" : ""}
</body></html>`);
}

// ---- routes ----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }
    if (p === "/" || p === "/configure") return statusPage(res);
    if (p === "/manifest.json") return json(res, 200, manifest());

    const streamMatch = p.match(/^\/stream\/(movie|series)\/(.+?)(\.json)?$/);
    if (streamMatch) {
      const kind = streamMatch[1] === "series" ? "tv" : "movie";
      const parsed = parseStreamId(streamMatch[2], streamMatch[1] === "series");
      if (!parsed) return json(res, 200, { streams: [] }, { "X-Cache": "badid" });

      let tmdbId = parsed.imdb ? await imdbToTmdb(parsed.id, kind) : parsed.id;
      if (!tmdbId) return json(res, 200, { streams: [] }, { "X-Cache": "badid" });

      const result = await getStreamsCached(kind, tmdbId, parsed.season, parsed.episode);
      return json(res, 200, { streams: result.streams }, { "X-Cache": result.cache });
    }

    return json(res, 404, { error: "unknown route", path: p });
  } catch (e) {
    console.error(`[server] ${p} failed: ${e && e.stack}`);
    // fail-soft: the addon protocol prefers an empty stream list over an error
    return json(res, 200, { streams: [] });
  }
});

server.listen(PORT, () => {
  console.log(`[server] ${ADDON_NAME} v${VERSION} listening on :${PORT}`);
  console.log(`[server] manifest: ${HOST || "http://localhost:" + PORT}/manifest.json`);

  // v1.0.1 keep-warm: Render free tier idles an instance after ~15min without
  // traffic, and the next request then eats a ~50s cold start. A self-ping
  // every 14min keeps it awake. Disable with KEEP_WARM=false (note: Render's
  // free allowance is 750 instance-hours/month - one always-on service fits).
  if ((process.env.KEEP_WARM || "true") === "true" && HOST) {
    const url = HOST.replace(/\/$/, "") + "/healthz";
    const ping = () => fetch(url).catch(() => {});
    ping();
    const iv = setInterval(ping, 14 * 60 * 1000);
    if (iv.unref) iv.unref();
    console.log(`[server] keep-warm self-ping every 14min -> ${url}`);
  }
});
