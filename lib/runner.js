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
// Design rules (learned from the pack's device-killer history):
//  - every provider call is raced against PROVIDER_TIMEOUT_MS and RESOLVES to
//    [] on timeout (never rejects, never wedges the aggregate response)
//  - a provider that throws synchronously or asynchronously becomes []
//  - rows are deduped by URL and capped (MAX_ROWS)
//  - torrent providers are skipped: their rows are magnet/infohash based and
//    cannot play through the Stremio HTTP stream protocol without a debrid

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SKIP_PROVIDERS = new Set(
  (process.env.SKIP_PROVIDERS || "torrents,tagalogtorrents")
    .split(",").map((s) => s.trim()).filter(Boolean)
);
const PROVIDER_TIMEOUT_MS = parseInt(process.env.PROVIDER_TIMEOUT_MS || "20000", 10);
const MAX_ROWS = parseInt(process.env.MAX_ROWS || "100", 10);
const TMDB_API_KEY = process.env.TMDB_API_KEY || "307b7b8ef035c6aa336900aef4e203bd";
const TMDB_LANG = process.env.TMDB_LANG || "en";

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
      console.log(`[runner] skip ${entry.id} (torrent lane, env SKIP_PROVIDERS)`);
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
        getStreams: mod.getStreams,
      });
    } catch (e) {
      loadErrors.push(`${entry.id}: ${e.message}`);
      console.error(`[runner] load fail ${entry.id}: ${e.message}`);
    }
  }
  console.log(`[runner] loaded ${providers.length} providers ` +
    `(skipped torrent lanes: ${[...SKIP_PROVIDERS].join(", ")})`);
}

// Race any promise against a hard cap that RESOLVES to [] (never rejects).
// The cap wraps the WHOLE chain: a provider promise that hangs forever must
// still lose the race (racing after .then() would never fire the timer's
// result - the exact hang class the pack's device-killer fixes removed).
function withTimeout(promiseFactory, ms, label) {
  const work = Promise.resolve()
    .then(promiseFactory)
    .then((v) => (Array.isArray(v) ? v : []))
    .catch((e) => {
      console.error(`[runner] ${label} threw: ${e && e.message}`);
      return [];
    });
  const cap = new Promise((resolve) => {
    setTimeout(() => {
      console.log(`[runner] timeout ${label} >${ms}ms (rows dropped)`);
      resolve([]);
    }, ms);
  });
  return Promise.race([work, cap]);
}

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

// ---- aggregation ---------------------------------------------------------

async function runAll(mediaType, tmdbId, season, episode) {
  const t0 = Date.now();
  const type = normalizeType(mediaType) === "tv" ? "tv" : "movie";
  const pool = providers.filter((p) => p.types.has(type));
  if (type === "tv") {
    // pack convention: providers default to S1E1 when the app omits it
    season = season && /^\d+$/.test(String(season)) ? String(parseInt(season, 10)) : "1";
    episode = episode && /^\d+$/.test(String(episode)) ? String(parseInt(episode, 10)) : "1";
  }

  const jobs = pool.map((p) =>
    withTimeout(
      () => p.getStreams(String(tmdbId), type, season, episode),
      PROVIDER_TIMEOUT_MS,
      p.id
    ).then((rows) => {
      const dt = Date.now() - t0;
      if (rows.length) console.log(`[runner] ${p.id}: ${rows.length} rows in ${dt}ms`);
      return { id: p.id, name: p.name, rows };
    })
  );

  const results = await Promise.all(jobs); // every job is bounded by the cap
  const streams = [];
  const seen = new Set();
  let liveProviders = 0;
  for (const r of results) {
    let added = 0;
    for (const row of r.rows || []) {
      if (!row || typeof row.url !== "string" || !row.url) continue;
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      const out = { name: r.name, title: row.title || row.name || r.name, url: row.url };
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
  console.log(`[runner] TOTAL ${type} ${tmdbId} S${season}E${episode}: ` +
    `${streams.length} rows from ${liveProviders} providers in ${Date.now() - t0}ms`);
  return { streams, liveProviders, elapsedMs: Date.now() - t0 };
}

function stats() {
  return {
    loaded: providers.length,
    ids: providers.map((p) => p.id),
    loadErrors,
    skipped: [...SKIP_PROVIDERS],
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  };
}

module.exports = { loadProviders, runAll, stats, imdbToTmdb, normalizeType };
