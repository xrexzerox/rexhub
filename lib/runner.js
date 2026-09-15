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
// SPEED MODEL (v1.0.1) - why requests now answer in seconds, not 20:
//  1. EARLY EXIT: the aggregate responds as soon as ENOUGH rows have landed
//     (EARLY_ROWS after EARLY_MIN_MS), instead of waiting for the dozen
//     always-slow scrapers to hit the cap. Hard deadline still applies.
//  2. STREAM CACHE: identical requests (same type/id/season/episode) return
//     instantly from an in-memory TTL cache. Nuvio asks for the same id
//     repeatedly (detail screen + play + retries).
//  3. IN-FLIGHT DEDUP: concurrent identical requests share one fan-out.
//  4. STALE-WHILE-REVALIDATE: an expired cache entry is served immediately
//     while a background refresh runs.
// Safety rules (learned from the pack's device-killer history) unchanged:
// every provider call is raced against a hard cap that RESOLVES to [] (never
// rejects, never wedges), throws become [], rows deduped by URL and capped.

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

// early-exit knobs (v1.0.1)
const RESPONSE_DEADLINE_MS = parseInt(process.env.RESPONSE_DEADLINE_MS || String(PROVIDER_TIMEOUT_MS), 10);
const EARLY_MIN_MS = parseInt(process.env.EARLY_MIN_MS || "4000", 10);
const EARLY_ROWS = parseInt(process.env.EARLY_ROWS || "8", 10);
const EARLY_DONE_PROVIDERS = parseInt(process.env.EARLY_DONE_PROVIDERS || "25", 10);

// cache knobs (v1.0.1)
const STREAM_CACHE_TTL_MS = parseInt(process.env.STREAM_CACHE_TTL_MS || "1800000", 10);
const CACHE_MAX = parseInt(process.env.CACHE_MAX || "300", 10);

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
    `(skipped torrent lanes: ${[...SKIP_PROVIDERS].join(", ")}) ` +
    `early-exit: respond after ${EARLY_MIN_MS}ms once ${EARLY_ROWS}+ rows, ` +
    `deadline ${RESPONSE_DEADLINE_MS}ms`);
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
    const t = setTimeout(() => {
      console.log(`[runner] timeout ${label} >${ms}ms (rows dropped)`);
      resolve([]);
    }, ms);
    if (t.unref) t.unref();
  });
  return Promise.race([work, cap]);
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

function aggregate(settled) {
  const streams = [];
  const seen = new Set();
  let liveProviders = 0;
  for (const s of settled) {
    if (!s) continue;
    let added = 0;
    for (const row of s.rows) {
      if (!row || typeof row.url !== "string" || !row.url) continue;
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      const out = { name: s.name, title: row.title || row.name || s.name, url: row.url };
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

  // Early-exit poll: enough rows landed (or enough providers finished) and a
  // floor time passed -> stop waiting for stragglers.
  let earlyIv = null;
  const earlyEnough = new Promise((resolve) => {
    earlyIv = setInterval(() => {
      if (done === total) return; // allDone will win the race anyway
      const elapsed = Date.now() - t0;
      if (elapsed < EARLY_MIN_MS) return;
      const rowsReady = settled.reduce((a, s) => a + (s ? s.rows.length : 0), 0);
      if (rowsReady >= EARLY_ROWS ||
          (done >= Math.min(EARLY_DONE_PROVIDERS, total) && rowsReady >= 1)) {
        resolve();
      }
    }, 200);
  });

  let why;
  try {
    why = await Promise.race([
      Promise.all(jobs).then(() => "complete"),
      earlyEnough.then(() => "early"),
      sleep(RESPONSE_DEADLINE_MS).then(() => "deadline"),
    ]);
  } finally {
    if (earlyIv) clearInterval(earlyIv);
  }

  const { streams, liveProviders } = aggregate(settled);
  const elapsedMs = Date.now() - t0;
  console.log(`[runner] RESPOND ${type} ${tmdbId} S${season || "-"}E${episode || "-"} ` +
    `(${why}): ${streams.length} rows from ${liveProviders} providers ` +
    `${done}/${total} done in ${elapsedMs}ms`);
  return { streams, liveProviders, elapsedMs };
}

// ---- cache + in-flight dedup + stale-while-revalidate ----------------------

const streamCache = new Map(); // key -> { at, streams, liveProviders }
const inflight = new Map(); // key -> Promise<result>

function cacheStore(key, result) {
  streamCache.set(key, {
    at: Date.now(),
    streams: result.streams,
    liveProviders: result.liveProviders,
  });
  if (streamCache.size > CACHE_MAX) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of streamCache) {
      if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    }
    if (oldestKey) streamCache.delete(oldestKey);
  }
}

async function getStreamsCached(type, tmdbId, season, episode) {
  const key = `${normalizeType(type)}:${tmdbId}:${season || ""}:${episode || ""}`;
  const now = Date.now();
  const hit = streamCache.get(key);

  if (hit) {
    if (now - hit.at <= STREAM_CACHE_TTL_MS) {
      return { ...hit, cache: "hit" };
    }
    // expired -> serve stale now, refresh in the background (once)
    if (!inflight.has(key)) {
      const p = runAllUncached(type, tmdbId, season, episode)
        .then((r) => { cacheStore(key, r); return r; })
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
    .then((r) => { cacheStore(key, r); return r; })
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
  };
}

module.exports = { loadProviders, getStreamsCached, stats, imdbToTmdb, normalizeType };
