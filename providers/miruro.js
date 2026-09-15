/**
 * Miruro - Nuvio provider (v2.9.0)
 * v2.9.0 (2026-09-13): RESTORED the device-proven 85KB v2.7.0 base (fail-open
 * post-filter, CDN hint rotation, ani.zip mal+ani dual-route enrichment, pipe
 * circuit breaker, overall deadline - the hardening that was stripped from the
 * 4.28.0-4.30.0 v2.8.0 rewrite) and grafted the 2026-09 MegaPlay API fix onto
 * it: getSourcesNew now AES-encrypts the stream URL in "enc" and the CDN gates
 * master.m3u8 behind a signed ?token= (details at the helper block). THE KEY
 * DEVICE FIX: crypto is taken from require('crypto-js') (the app runtime
 * bundles a capable CryptoJS polyfill) - v2.8.0 probed the harness-only
 * __nvRequire shim first, found it missing on every device and silently
 * returned zero rows (the "anikoto catalog uses miruro.js" regression).
 *
 * v2.7.0 (2026-09-11) "its work with movie example Shin Gintama Movie:
 * Yoshiwara Daienjou but for tv or series is not showing stream link"
 * (on the deployed 4.10.0) - THE CATALOG-ID PARSER WAS THE LAST MILE:
 * the user's own report proved the whole device chain works for MOVIES
 * (same MegaPlay route, same ani.zip, same post-filter), so the break had
 * to sit between the addon meta and getStreams. Reproduced live in 4.10.0:
 *   getStreams("mal:61240", "series", 1, 9)     -> 2 rows   (bare meta id)
 *   getStreams("mal:61240:1:9", "series", 1, 9) -> 0 rows   (EPISODE id)
 *   getStreams("mal%3A61240%3A1%3A9", ...)      -> 0 rows   (urlencoded)
 *   getStreams("mal:61240.json", ...)           -> 0 rows   (.json)
 *   getStreams("mal:61240/1/9", ...)            -> 0 rows   (path style)
 * The addon meta (Stremio protocol) gives each episode its own id
 * "mal:{id}:1:{ep}" (asian-catalog core.js: id = key + ':1:' + num), and
 * Nuvio passes the TAPPED EPISODE's id as the stream videoId - the app only
 * passes the bare meta id for MOVIES (no episodes). The strict regex
 * ^(mal|anilist|kitsu|anikoto):(\\d+)$ rejected every decorated shape and
 * the request fell into the numeric-TMDB branch -> 0 rows. Every
 * battle-tested parser in this repo (pinoyhub.js/asianhub.js/animotvslash.js)
 * already tolerates exactly these decorations - miruro's was the only one
 * written from the "arrives verbatim" assumption and never device-tested.
 * Changes:
 *   - parseCatalogAnimeId(): token-based tolerant parser - percent-decodes,
 *     strips query/hash/.json, accepts ":" or "/" separators anywhere in the
 *     string, and EXTRACTS the trailing ":s:e" (or "/s/e", or single ":e")
 *     so the episode number survives even when Nuvio sends only the id.
 *   - getStreams now prefers the explicit season/episode args (4-arg Nuvio
 *     contract) and falls back to the id-suffix numbers when they are
 *     missing; mediaType slot is auto-detected so legacy 3-arg callers
 *     (tmdbId, season, episode) can no longer shift season/episode.
 *
 * v2.6.0 (2026-09-11) "Anikoto latest episode - Though I am an Inept
 * Villainess S1 E9 - still comes up empty" (on the deployed 4.9.0):
 * the report was chased from both ends and produced these verified facts:
 *   - The addon's DETAILS page was the empty part while it happened: Jikan
 *     was serving 200-wrapped outages ({"status":500,"type":
 *     "UpstreamException","message":"Request to MyAnimeList.net timed out"})
 *     and HTTP 504s for mal 61240 -> the addon returned 404/502 -> Nuvio
 *     rendered an empty details screen. (Fixed in the asian-catalog addon
 *     5.1.0, which now falls back to the mapped Anikoto series data.)
 *   - MegaPlay itself was healthy for the same show from the datacenter:
 *     BOTH its mal route (/stream/mal/61240/9 -> file 179430) AND its ani
 *     route (/stream/ani/188139/9 -> the same file) serve episode 9.
 *   - The miruro pipe lane (the megaplay-independent lane) is DEAD upstream:
 *     all four origins (www.miruro.ru/.to/.bz/.tv) answer HTTP 403 - each
 *     call burned 4 x 6s of the 10.5s deadline for nothing.
 *   - MegaPlay's CDN selector hints (?s=tcdn/bcdn) do NOT rotate ANIME
 *     sources: all three hints return the identical ncdn.imgnex.top master
 *     URL (the hints only matter for the megap.* hosts), so v2.5.0's hint
 *     rotation re-probed the SAME URL 2 extra times per language.
 * Changes:
 *   - ani.zip ENRICHMENT for catalog ids: "mal:{id}" now also resolves its
 *     AniList id via api.ani.zip/mappings?mal_id={id} (one CDN request,
 *     24h cache; verified 61240 -> 188139). mpFileId then holds BOTH MegaPlay
 *     routes for the same episode (mal AND ani) - when one side lags behind
 *     on a just-aired episode the other still resolves - and the pipe lane
 *     can use the anilistId too once the pipe recovers.
 *   - PIPE CIRCUIT BREAKER: a 403 from any pipe origin (a hard block, not a
 *     transient timeout) benches the whole pipe lane for 15 minutes so dead
 *     pipe sweeps stop eating the deadline.
 *   - MASTER-PROBE MEMO: megaPlayRowsSmart remembers the verdict per master
 *     URL within a call, so identical URLs (the anime-hint case) are probed
 *     once instead of three times, and host-swaps skip URLs already probed.
 *
 * v2.5.0 (2026-09-11) "still not showing streamable link ... unlike
 * animotvslash works perfectly": the deployed 4.8.0 chain was verified
 * healthy from the datacenter (megaplay.buzz 60ms, ani.zip 379ms, master
 * playlists 200), so the zero-rows report is DEVICE-NETWORK-specific - and
 * three properties made miruro's device result all-or-nothing:
 *   1. FAIL-CLOSED post-filter: any row whose HLS master probe fails
 *      (blocked CDN host, slow mobile network, stripped probe header) was
 *      silently DELETED ("unknown resolution -> removed"). One unreachable
 *      host at the last hop zeroed the whole provider.
 *   2. SINGLE CDN HOST: getSourcesNew returns exactly one m3u8 host (e.g.
 *      megap.shiora.top). Devices behind DNS blocks of that host had no
 *      alternative - even though MegaPlay itself ships alternates.
 *   3. NO OVERALL DEADLINE: Promise.all waited for MegaPlay (8s+8s+7s
 *      sequential hops) AND the pipe lanes together, so one blackholed host
 *      burned the app-level stream timeout before ANY row rendered. The
 *      stream cache was also never written, so every retry re-ran the chain.
 * Fixes:
 *   - CDN SELF-HEALING: getSourcesNew accepts MegaPlay's own CDN selector
 *     (?s=tcdn -> megap.norami.top, ?s=bcdn -> megap.shiora.site; verified
 *     live) and all five MegaPlay CDN hosts serve IDENTICAL paths
 *     (megap.shiora.top/.site, megap.norami.top, megap.akirax.buzz,
 *     megap.mikora.top; verified byte-equal variant ladders). The lane now
 *     rotates hints + host-swaps until the master playlist actually
 *     downloads on THIS device; whatever host worked is the one put in the
 *     rows. On healthy networks the first attempt wins: zero extra HTTP.
 *   - FAIL-OPEN PROBE: the injected post-filter now distinguishes "probe
 *     request failed" (network problem -> row KEPT, untagged) from "probe
 *     succeeded but no resolution info" (still dropped). CAM/SD dropping
 *     and the language gate are unchanged.
 *   - 10.5s OVERALL DEADLINE with partial-row collection: rows land in a
 *     collector as each lane finishes; the deadline flushes whatever is
 *     already collected (e.g. pipe rows) instead of starving under Promise.
 *     all. Partial/empty results are cached briefly (60s) so retries are
 *     instant, successes keep the 10min TTL (cache is finally WRITTEN at all).
 *   - Timeouts trimmed: MegaPlay embed/sources 8s -> 6s, master 7s -> 5s,
 *     pipe per-origin 12s -> 6s, mapping deadline 11s -> 8s.
 *
 * v2.4.0 (2026-09-11) "still not fetching ... update the asian-catalog fully
 * support anlist mal kitsu so that miruro will work": the asian-catalog
 * addon (v5.0.0) now emits ANIME ids for its Anikoto sections — "mal:{id}",
 * "anilist:{id}", "anikoto:{id}" — and Nuvio passes unknown-prefix ids to
 * plugins VERBATIM (verified in NuvioMobile PluginContentIds +
 * TmdbService.ensureTmdbId). miruro now understands those ids directly and
 * skips the TMDB-mapping phase entirely for them:
 *   - "mal:{id}"      -> MegaPlay /stream/mal/{id}/{ep}/{lang} (primary lane)
 *   - "anilist:{id}"  -> MegaPlay /stream/ani/... + secure pipe lane
 *   - "kitsu:{id}"    -> Kitsu /anime/{id}?include=mappings -> mal/anilist
 *   - "anikoto:{id}"  -> Anikoto /series/{id} episode list -> the episode's
 *                        episode_embed_id drives MegaPlay /stream/s-2/{id}/
 *                        {lang} DIRECTLY (the exact pairing MegaPlay's own
 *                        API docs recommend), plus mal/ani lanes from the
 *                        same response in parallel
 * Numeric ids keep the v2.3.0 path (ani.zip themoviedb_id deterministic
 * mapping -> title-search fallback). Catalog-sourced anime now play with
 * ZERO mapping latency and no dependency on AniList being alive.
 *
 * v2.3.0 (2026-09-11) "please use tmdb for miruro": the TMDB -> anime id
 * AniList GraphQL is down again (403 "temporarily disabled", verified live);
 * v2.0.0 tried it SERIALLY (2 x 8s timeout attempts) before Kitsu/Jikan, and
 * behind Cloudflare a device can hang on it instead of failing fast - so the
 * app-level stream timeout fired before MegaPlay ever started. Changes:
 *   - Mapping jobs now run IN PARALLEL (AniList if alive + Kitsu->Jikan);
 *     first valid mapping wins (~1-2s typical instead of up to 36s worst).
 *   - AniList circuit breaker: one failure benches it for 15 minutes.
 *   - Hard 11s deadline on the whole mapping phase (late results still get
 *     cached and serve the NEXT episode).
 *   - MegaPlay/TMDB timeouts trimmed (embed/sources 8s, master 7s, tmdb 7s).
 *
 * v2.1.0 (2026-09-11) "still dont fetches stream": the v2.0.0 code worked in
 * every desktop/Node runtime but returned ZERO rows in Nuvio's mobile JS
 * runtime (Hermes). Root cause: b64urlEncode() used the legacy global
 * unescape(), which Hermes does not implement. pipeRequest() called it
 * SYNCHRONOUSLY, so a ReferenceError was thrown before any promise existed,
 * unwound through pipeLanes() into the getStreams() chain and the outer
 * .catch() returned [] - killing the WORKING MegaPlay lanes too. Reproduced
 * in an unescape-less sandbox: 0 rows; fixed: rows return. Changes:
 *   - b64urlEncode() now does manual UTF-8 encoding (no unescape/escape,
 *     no Buffer) - Hermes/QuickJS/browser/Node all safe.
 *   - pipeRequest() can no longer throw synchronously (try/catch -> reject).
 *   - MegaPlay sub+dub file lookups run in parallel (paced queue still
 *     spaces the HTTP calls) to halve wall-clock on device connections.
 *
 * v2.3.0 (2026-09-11) "please use tmdb for miruro": the TMDB -> anime id
 * mapping is now DETERMINISTIC and driven by the TMDB id itself via ani.zip
 * (api.ani.zip/mappings?themoviedb_id={tmdbId} returns mal_id + anilist_id
 * for exactly the id Nuvio passes). Verified 2026-09-11: Frieren 209867 ->
 * mal 52991 / al 154587, Suzume 916224 -> 50594/142770, One Piece 37854 ->
 * 21/21, Shippuden 31910 -> 1735/1735, Solo Leveling 127532 -> 52299,
 * Jujutsu Kaisen 95479 -> 40748. The old Kitsu/Jikan/AniList title-search
 * cluster only starts when ani.zip has no entry for the id (Demon Slayer
 * 85494, Spy x Family...) and is skipped ENTIRELY when the ani.zip lookup
 * wins - so the typical episode now maps in one CDN-fast request, and the
 * flaky AniList API is only touched as a last resort.
 *
 * Anime (and anime movies) from miruro.tv - the mirror ring also answers on
 * miruro.to / miruro.ru / miruro.bz. User request 2026-09-11: "create scraper
 * for https://www.miruro.tv/"; 2026-09-11 follow-up: "not fetching anime
 * seasons and episodes".
 *
 * v1.0.0 relied on the anixo.buzz relay - that relay is now BROKEN upstream:
 * it answers every query (any malId / title / episode / track) with one and
 * the same cached stream token (verified byte-identical playlists for
 * different episodes on 2026-09-11). AniList GraphQL was also down the same
 * day (403 "temporarily disabled"), which killed the pipe lane's id mapping
 * and left only the constant relay - every anime episode played the same
 * video. That is exactly the reported "seasons and episodes not fetching".
 *
 * v2.0.0 replaces the relay with the MegaPlay chain it used to front
 * (megaplay.buzz is the site the anixo notice names as its origin; it is
 * reachable from datacenter IPs and devices alike):
 *
 * Lane A (primary): MegaPlay file resolution.
 *   1. embed page  GET https://megaplay.buzz/stream/mal/{malId}/{ep}/{sub|dub}
 *      (same for /ani/{anilistId}/...) - the server resolves its own content
 *      id server-side. Player div carries data-id="NNNNNN" (the stable file
 *      id for that episode+language; title says "File NNNN - MegaPlay").
 *      Error pages (rate limit / unmapped MAL id) print "Error Code: NNN".
 *   2. sources     GET https://megaplay.buzz/stream/getSourcesNew?id={fileId}
 *      (XMLHttpRequest header required) ->
 *      { sources:{file: master.m3u8}, tracks:[{file,label,kind}], intro, outro }
 *      master.m3u8 has RESOLUTION variants (1080p/360p observed) -> parsed so
 *      every useful variant becomes a row; tracks become English/Tagalog subs.
 *      The m3u8 CDN (megap.shiora / megap.akirax hosts) is Cloudflare
 *      fronted but serves devices; referer megaplay.buzz is attached.
 *
 * Lane B (fail-soft, device-only): the site's own /api/secure/pipe endpoint.
 *   GET {origin}/api/secure/pipe?e=base64url({path,method,query,body})
 *   Response header x-obfuscated: "2" = base64url -> XOR(key) -> gunzip -> JSON.
 *   Cloudflare blocks datacenter IPs here, so this lane targets the user's
 *   device connection and every failure is silent. Decompression uses a small
 *   embedded inflate (DEFLATE) since Nuvio's JS runtime has no zlib.
 *
 * TMDB -> anime id mapping (season-aware):
 *   - AniList GraphQL title/year search (also feeds the pipe lane's anilistId)
 *   - Kitsu /api/edge (include=mappings -> myanimelist + anilist ids) works
 *     even while AniList is down
 *   - Jikan (api.jikan.moe) as the last title fallback
 *   For TMDB season 2+ a season-specific entry is searched first ("title
 *   season N" / "title Nth season" validated by the season's air year on
 *   TMDB). When no season entry exists the base entry is used with an
 *   absolute episode number computed from TMDB season episode counts.
 *
 * Language policy (pack-wide): sub lanes (original audio + en subs) and dub
 * lanes (English dub) are emitted; subtitles are filtered to English +
 * Filipino/Tagalog. The universal post-filter appended below enforces the
 * audio/quality/dedupe rules.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var MEGAPLAY_BASE = "https://megaplay.buzz";
var KITSU_BASE = "https://kitsu.io/api/edge";
var JIKAN_BASE = "https://api.jikan.moe/v4";
// v2.3.0: deterministic TMDB-keyed anime id mapping (mal_id + anilist_id)
var ANIZIP_BASE = "https://api.ani.zip";
// v2.4.0: Anikoto API — the asian-catalog addon's anime sections source.
// /series/{id} returns the episode list with MegaPlay s-2 embed ids.
var ANIKOTO_API = "https://anikotoapi.site";
var MIRURO_ORIGINS = [
  "https://www.miruro.ru",
  "https://www.miruro.to",
  "https://www.miruro.bz",
  "https://www.miruro.tv"
];
var PIPE_PATH = "/api/secure/pipe";
// 16-byte XOR key used by the pipe's x-obfuscated: "2" responses
var PIPE_OBF_KEY = [0x71, 0x95, 0x10, 0x34, 0xf8, 0xfb, 0xcf, 0x53,
                    0xd8, 0x9d, 0xb5, 0x2c, 0xeb, 0x3d, 0xc2, 0x2c];

var COMMON_UA = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Mobile Safari/537.36";
var PIPE_HEADERS = {
  "User-Agent": COMMON_UA,
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="137", "Not?A_Brand";v="24"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "Referer": "https://www.miruro.to/",
  "Origin": "https://www.miruro.to"
};

function settings() {
  return typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS
    ? globalThis.SCRAPER_SETTINGS
    : (typeof global !== "undefined" && global.SCRAPER_SETTINGS ? global.SCRAPER_SETTINGS : {});
}

// ------------------------------------------------------------- cache / util

var CACHE_TTL = 10 * 60 * 1000;
var _G = typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : this;
var _muState = _G.__MIRURO_STATE__ || (_G.__MIRURO_STATE__ = { cache: {}, inflight: {} });

function cacheKey(tmdbId, mediaType, season, episode) {
  return (mediaType === "tv" ? "tv" : "movie") + ":" + tmdbId + ":" + (season || 1) + ":" + (episode || 1);
}

function hasTimers() { return typeof setTimeout === "function"; }

// Paced queue for third-party mapping APIs (Kitsu/Jikan throttle bursts).
var _mapLastReq = 0;
function mapGap() {
  return new Promise(function (resolve) {
    var now = Date.now();
    var wait = _mapLastReq + 450 - now;
    if (wait < 0) wait = 0;
    _mapLastReq = now + wait;
    if (!hasTimers() || !wait) resolve(null);
    else setTimeout(resolve, wait);
  });
}

// Mapping cache: the same show's episodes reuse one TMDB->anime resolution
// (6h TTL) so browsing N episodes costs ONE mapping burst, not N.
var MAP_CACHE_TTL = 6 * 60 * 60 * 1000;
var _mapCache = _muState.mapCache || (_muState.mapCache = {});

function fetchText(url, headers, timeoutMs) {
  var opts = { method: "GET", redirect: "follow", headers: headers || {} };
  function fail(res) {
    return res.text().then(function () { throw new Error("HTTP " + res.status); });
  }
  if (!hasTimers()) return fetch(url, opts).then(function (res) {
    if (!res.ok) return fail(res);
    return res.text();
  });
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("fetch timeout")); }, timeoutMs || 12000);
    fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) fail(res).then(function (e) { reject(e); }, function (e) { reject(e); });
      else res.text().then(function (t) { resolve(t); }, function (e) { reject(e); });
    }).catch(function (e) { clearTimeout(timer); reject(e); });
  });
}

function fetchJson(url, headers, timeoutMs) {
  return fetchText(url, headers, timeoutMs).then(function (t) {
    try { return JSON.parse(t); } catch (e) { return null; }
  });
}

function b64urlEncode(str) {
  // base64url with NO runtime extras: manual UTF-8 encoding. The old
  // encodeURIComponent+unescape trick died on Hermes (no unescape global)
  // and the synchronous ReferenceError zeroed the whole provider (v2.1.0).
  var s = String(str);
  var bytes = [], i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var c2 = s.charCodeAt(++i);
      var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var out = [], n, j;
  for (j = 0; j < bytes.length; j += 3) {
    n = (bytes[j] << 16) + ((bytes[j + 1] || 0) << 8) + (bytes[j + 2] || 0);
    out.push(chars.charAt((n >> 18) & 63), chars.charAt((n >> 12) & 63));
    out.push(j + 1 < bytes.length ? chars.charAt((n >> 6) & 63) : "");
    out.push(j + 2 < bytes.length ? chars.charAt(n & 63) : "");
  }
  // unpadded base64url (matches Node's base64url and the site's own encoder)
  return out.join("");
}

function b64urlDecodeBytes(str) {
  var norm = String(str).replace(/-/g, "+").replace(/_/g, "/");
  norm += "=";
  var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var bytes = [], buf = 0, bits = 0, i, c;
  for (i = 0; i < norm.length; i++) {
    c = table.indexOf(norm.charAt(i));
    if (c === -1) continue;
    buf = (buf << 6) | c;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  var out = "", i = 0;
  while (i < bytes.length) {
    var b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
    else if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
    else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    }
  }
  return out;
}

// ------------------------------------------------------- embedded inflate

// Minimal DEFLATE/gzip decoder (ES5). Validates against Node zlib in
// scripts/test-miruro.js. Only used for pipe responses with x-obfuscated:2.
function inflateGzip(bytes) {
  var pos = 0;
  function u8() { return bytes[pos++]; }
  function u16() { var v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v; }
  function u32() { var v = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0; pos += 4; return v; }
  // gzip header
  if (u8() !== 0x1f || u8() !== 0x8b) throw new Error("not gzip");
  var cm = u8();
  if (cm !== 8) throw new Error("bad method " + cm);
  var flg = u8();
  pos += 6; // mtime(4) + xfl(1) + os(1)
  if (flg & 4) { var xlen = u16(); pos += xlen; }
  if (flg & 8) { while (u8() !== 0) {} }         // fname
  if (flg & 16) { while (u8() !== 0) {} }        // fcomment
  if (flg & 2) { pos += 2; }                     // fhcrc
  // raw DEFLATE blocks
  var out = [];
  var bitbuf = 0, bitcnt = 0;
  function bits(n) {
    while (bitcnt < n) { bitbuf |= bytes[pos++] << bitcnt; bitcnt += 8; }
    var v = bitbuf & ((1 << n) - 1);
    bitbuf >>= n; bitcnt -= n;
    return v;
  }
  function buildTree(lengths) {
    var counts = [], i;
    for (i = 0; i <= 15; i++) counts[i] = 0;
    for (i = 0; i < lengths.length; i++) counts[lengths[i]]++;
    // offs[1] = 0 and zero-length symbols excluded (canonical puff offsets)
    var offs = [];
    offs[1] = 0;
    for (i = 1; i <= 14; i++) offs[i + 1] = offs[i] + counts[i];
    var symbols = [];
    for (i = 0; i < lengths.length; i++) {
      if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    }
    return { counts: counts, symbols: symbols };
  }
  function decodeSym(tree) {
    var code = 0, first = 0, index = 0, len;
    for (len = 1; len <= 15; len++) {
      code |= bits(1);
      var count = tree.counts[len];
      if (code - first < count) return tree.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("bad code");
  }
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  function fixedTrees() {
    var lengths = [], i;
    for (i = 0; i < 144; i++) lengths[i] = 8;
    for (i = 144; i < 256; i++) lengths[i] = 9;
    for (i = 256; i < 280; i++) lengths[i] = 7;
    for (i = 280; i < 288; i++) lengths[i] = 8;
    var lit = buildTree(lengths);
    var distLengths = [];
    for (i = 0; i < 30; i++) distLengths[i] = 5;
    return { lit: lit, dist: buildTree(distLengths) };
  }
  var FIXED = null;
  for (;;) {
    var bfinal = bits(1), btype = bits(2), lit, dist;
    if (btype === 0) {
      bitbuf = 0; bitcnt = 0; // align
      var len = u16(), nlen = u16();
      for (var k = 0; k < len; k++) out.push(bytes[pos++]);
    } else if (btype === 1) {
      if (!FIXED) FIXED = fixedTrees();
      lit = FIXED.lit; dist = FIXED.dist;
      inflateBlock(lit, dist);
    } else if (btype === 2) {
      var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
      var cl = [];
      for (var ci = 0; ci < hclen; ci++) cl[order[ci]] = bits(3);
      for (var cj = 0; cj < 19; cj++) if (cl[cj] === undefined) cl[cj] = 0;
      var clTree = buildTree(cl);
      var lens = [];
      while (lens.length < hlit + hdist) {
        var sym = decodeSym(clTree);
        if (sym < 16) lens.push(sym);
        else if (sym === 16) {
          var prev = lens[lens.length - 1], rep = 3 + bits(2);
          while (rep--) lens.push(prev);
        } else if (sym === 17) { var z = 3 + bits(3); while (z--) lens.push(0); }
        else { var z8 = 11 + bits(7); while (z8--) lens.push(0); }
      }
      lit = buildTree(lens.slice(0, hlit));
      dist = buildTree(lens.slice(hlit));
      inflateBlock(lit, dist);
    } else {
      throw new Error("bad block type");
    }
    if (bfinal) break;
  }
  function inflateBlock(lit, dist) {
    for (;;) {
      var sym = decodeSym(lit);
      if (sym < 256) out.push(sym);
      else if (sym === 256) return;
      else {
        var li = sym - 257;
        var length = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
        var di = decodeSym(dist);
        var d = DIST_BASE[di] + (DIST_EXTRA[di] ? bits(DIST_EXTRA[di]) : 0);
        var start = out.length - d;
        for (var q = 0; q < length; q++) out.push(out[start + q]);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ pipe protocol

function pipeDecode(encodedStr, obfHeader) {
  if (!obfHeader) return JSON.parse(encodedStr);
  var bytes = b64urlDecodeBytes(encodedStr);
  if (String(obfHeader) === "2") {
    for (var i = 0; i < bytes.length; i++) bytes[i] = bytes[i] ^ PIPE_OBF_KEY[i % PIPE_OBF_KEY.length];
  }
  var out = inflateGzip(bytes); // array of bytes
  return JSON.parse(bytesToUtf8(out));
}

function pipeRequest(path, query) {
  // v2.1.0: everything before the first .then() is inside try/catch so this
  // function can NEVER throw synchronously (a sync throw here used to unwind
  // into getStreams and take the healthy MegaPlay lanes down with it).
  try {
    return pipeRequestInner(path, query);
  } catch (e) {
    console.log("[Miruro] pipe setup failed: " + (e && e.message ? e.message : e));
    return Promise.reject(e);
  }
}

var _pipeState = _muState.pipe || (_muState.pipe = { downUntil: 0 });
var PIPE_BREAK_MS = 15 * 60 * 1000;

function pipeRequestInner(path, query) {
  var payload = { path: path, method: "GET", query: query, body: null };
  var enc = b64urlEncode(JSON.stringify(payload));
  var idx = 0;
  function attempt() {
    // v2.6.0: a 403 from the pipe (hard upstream block, verified on all four
    // origins 2026-09-11) is not transient - bench the whole lane for 15min
    // instead of burning 4 x 6s of the deadline on every single call.
    if (Date.now() < _pipeState.downUntil) {
      return Promise.reject(new Error("pipe: circuit open (benched after 403)"));
    }
    if (idx >= MIRURO_ORIGINS.length) return Promise.reject(new Error("pipe: all mirrors failed"));
    var origin = MIRURO_ORIGINS[idx++];
    // v2.5.0: 6s per origin (was 12s) - a dead origin must not eat the
    // overall deadline; the next origin (or the MegaPlay lanes) takes over.
    return fetchText(origin + PIPE_PATH + "?e=" + enc, PIPE_HEADERS, 6000).then(function (body) {
      // fetchText throws on non-OK, so here status is 200
      return pipeDecode(body, "2");
    }).catch(function (err) {
      var msg = String((err && err.message) || err);
      console.log("[Miruro] pipe " + origin + " failed: " + msg);
      if (/HTTP 403/.test(msg)) {
        _pipeState.downUntil = Date.now() + PIPE_BREAK_MS;
        console.log("[Miruro] pipe benched for 15min (403 block)");
        return Promise.reject(new Error("pipe: benched (403)"));
      }
      return attempt();
    });
  }
  return attempt();
}

function pipeTranslateId(encodedId) {
  try {
    var decoded = bytesToUtf8(b64urlDecodeBytes(encodedId));
    if (decoded.indexOf(":") !== -1) return decoded;
    return encodedId;
  } catch (e) { return encodedId; }
}

function normalizeEpisodes(provData) {
  var eps = provData && provData.episodes;
  if (!eps) return {};
  if (Array.isArray(eps)) return { sub: eps, dub: [] };
  return {
    sub: Array.isArray(eps.sub) ? eps.sub : [],
    dub: Array.isArray(eps.dub) ? eps.dub : []
  };
}

/** Lane B: pipe episodes+sources for one anilist id. Fails soft.
 *  v2.5.0: optional sink(row) callback - each provider's rows are pushed the
 *  moment they resolve, so a hanging provider late in the chain cannot delay
 *  rows that are already in hand (the overall deadline flushes them). */
function pipeLanes(anilistId, epNumber, makeRow, sink) {
  return pipeRequest("episodes", { anilistId: anilistId }).then(function (data) {
    var providers = (data && data.providers) || {};
    var names = Object.keys(providers);
    if (!names.length) return [];
    var plan = [];
    names.forEach(function (pn) {
      var cats = normalizeEpisodes(providers[pn]);
      ["sub", "dub"].forEach(function (cat) {
        var list = cats[cat] || [];
        for (var i = 0; i < list.length; i++) {
          var ep = list[i];
          if (ep && ep.id && Number(ep.number) === Number(epNumber)) {
            plan.push({ provider: pn, category: cat, ep: ep });
            break;
          }
        }
      });
    });
    if (!plan.length) return [];
    console.log("[Miruro] pipe: " + plan.length + " provider match(es) for ep " + epNumber);
    var out = [];
    var chain = Promise.resolve();
    plan.slice(0, 6).forEach(function (p) {
      chain = chain.then(function () {
        var realId = pipeTranslateId(p.ep.id);
        return pipeRequest("sources", {
          episodeId: b64urlEncode(realId),
          provider: p.provider,
          category: p.category,
          anilistId: anilistId
        }).then(function (src) {
          var streams = (src && src.streams) || [];
          streams.forEach(function (st) {
            if (!st || !st.url || !/^https?:\/\//i.test(String(st.url))) return;
            out.push(makeRow(String(st.url), st.quality || st.label || "", p.provider, p.category));
          });
          // subtitles: English + Filipino/Tagalog only
          var subs = (src && (src.subtitles || src.captions)) || [];
          var picked = subs.filter(function (sb) {
            var l = String((sb && (sb.label || sb.language || sb.lang)) || "");
            return /^https?:/i.test(String(sb && sb.url || sb && sb.file || "")) &&
              /(english|filipino|tagalog)/i.test(l);
          }).slice(0, 8).map(function (sb) {
            var l = String(sb.label || sb.language || sb.lang || "");
            var isTl = /filipino|tagalog/i.test(l);
            return {
              url: String(sb.url || sb.file),
              language: isTl ? "tl" : "en",
              name: isTl ? "Tagalog / Filipino" : l
            };
          });
          if (picked.length) out.forEach(function (r) { if (!r.subtitles) r.subtitles = picked; });
          if (sink && out.length) out.forEach(sink);
        }).catch(function () {});
      });
    });
    return chain.then(function () { return out; });
  }).catch(function () { return []; });
}

// ----------------------------------------------------------- megaplay lane

// MegaPlay rate-limits aggressive scraping with decoy/error pages, so all
// embed+sources calls go through one paced queue (min gap between requests).
var _mpLastReq = 0;
function mpGap() {
  return new Promise(function (resolve) {
    var now = Date.now();
    var wait = _mpLastReq + 600 - now;
    if (wait < 0) wait = 0;
    _mpLastReq = now + wait;
    if (!hasTimers() || !wait) resolve(null);
    else setTimeout(resolve, wait);
  });
}

var MP_FILE_CACHE_TTL = 30 * 60 * 1000;
var _mpFileCache = _muState.mpFiles || (_muState.mpFiles = {});

/**
 * Resolve the stable MegaPlay "file id" (data-id on the player div) for one
 * episode+language. Tries the mal route first, then the ani route. Returns
 * a Promise for the file id string or null. Never rejects.
 */
function mpFileId(malId, anilistId, epNumber, lang) {
  var cacheKey = (malId || "a" + anilistId) + ":" + epNumber + ":" + lang;
  var hit = _mpFileCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_FILE_CACHE_TTL) {
    return Promise.resolve(hit.id);
  }
  var routes = [];
  if (malId) routes.push("mal/" + encodeURIComponent(malId));
  if (anilistId) routes.push("ani/" + encodeURIComponent(anilistId));
  var idx = 0;
  function attempt() {
    if (idx >= routes.length) return Promise.resolve(null);
    var path = routes[idx++] + "/" + encodeURIComponent(epNumber) + "/" + lang;
    return mpGap().then(function () {
      return fetchText(MEGAPLAY_BASE + "/stream/" + path, {
        "User-Agent": COMMON_UA,
        "Accept": "text/html,*/*",
        "Referer": MEGAPLAY_BASE + "/"
      }, 6000);
    }).then(function (html) {
      // error / decoy pages carry "Error Code: NNN" and no player div
      if (!html || html.indexOf("Error Code:") !== -1) return attempt();
      var m = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
              html.match(/data-id="(\d+)"/) ||
              html.match(/<title>File (\d+) - MegaPlay/);
      if (!m) return attempt();
      _mpFileCache[cacheKey] = { ts: Date.now(), id: m[1] };
      return m[1];
    }).catch(function () { return attempt(); });
  }
  return attempt();
}

/* =========================================================================
 * v2.9.0 MEGAPLAY 2026-09 API FIX (grafted onto the device-proven v2.7.0 base)
 * MegaPlay's getSourcesNew stopped returning the plain
 * {sources:{file}} body - it now ships the stream URL AES-encrypted in an
 * "enc" field: AES-256-CBC, key = hex 693f4c4d5441783051362c3a7d353055 +
 * 16 zero bytes, IV = ASCII "W0;27ToaUpl_P%'c", PKCS7 ->
 * {"file":".../master.m3u8"}. The CDN (fetch.nexabloom.top) answers 403
 * without a signed token: token = b64url("unixtime|<type>/<md5a>/<md5b>")
 * + "." + b64url(HMAC-SHA256(key "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s",
 * "unixtime|<type>/<md5a>/<md5b>")). Variant playlists need no token.
 * CRYPTO ACCESS ORDER MATTERS ON DEVICES: the Nuvio runtime bundles its own
 * AES-CBC + HMAC-SHA256 capable CryptoJS behind require('crypto-js') and
 * does NOT define __nvRequire (that shim only exists in the repo audit
 * harness - probing it first and giving up was why v2.8.0 returned zero
 * rows on every device). Order here: require('crypto-js') -> global
 * CryptoJS -> harness shim. Legacy plain bodies stay supported.
 * ========================================================================= */
function mpCjs() {
  try { if (typeof require === "function") { var c = require("crypto-js"); if (c && c.AES && c.HmacSHA256 && c.lib && c.lib.CipherParams) return c; } } catch (e) {}
  try { if (typeof CryptoJS !== "undefined" && CryptoJS.AES && CryptoJS.lib && CryptoJS.lib.CipherParams) return CryptoJS; } catch (e2) {}
  try { if (typeof __nvRequire === "function") { var c2 = __nvRequire("crypto-js"); if (c2 && c2.AES && c2.HmacSHA256 && c2.lib && c2.lib.CipherParams) return c2; } } catch (e3) {}
  return null;
}
var _mpAES = null, _mpHMAC = null, _mpIV = null;
function mpKeys() {
  var C = mpCjs();
  if (!C) return false;
  if (!_mpAES) {
    try {
      _mpAES = C.enc.Hex.parse("693f4c4d5441783051362c3a7d35305500000000000000000000000000000000");
      _mpIV = C.enc.Utf8.parse("W0;27ToaUpl_P%'c");
      _mpHMAC = C.enc.Utf8.parse("MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s");
    } catch (e) { return false; }
  }
  return true;
}
function mpDecryptFile(enc) {
  try {
    var C = mpCjs();
    if (!C || !mpKeys()) return null;
    var ct = C.enc.Base64.parse(String(enc).replace(/-/g, "+").replace(/_/g, "/"));
    var params = C.lib.CipherParams.create({ ciphertext: ct });
    var pt = C.AES.decrypt(params, _mpAES, { iv: _mpIV, mode: C.mode.CBC, padding: C.pad.Pkcs7 });
    var txt = pt.toString(C.enc.Utf8);
    if (!txt) return null;
    var j = JSON.parse(txt);
    return j && j.file ? String(j.file) : null;
  } catch (e) { return null; }
}
function mpTokenForPath(path) {
  var C = mpCjs();
  if (!C || !mpKeys()) return "";
  try {
    var msg = Math.floor(Date.now() / 1000) + "|" + path;
    var b64url = function (wa) {
      return wa.toString(C.enc.Base64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    return b64url(C.enc.Utf8.parse(msg)) + "." + b64url(C.HmacSHA256(msg, _mpHMAC));
  } catch (e) { return ""; }
}
/** decrypted "file" URL -> { plain, tokenized, path } ("path" = the HMAC msg tail) */
function mpTokenizeMaster(fileUrl) {
  var f = String(fileUrl || "");
  if (/\/$/.test(f)) f += "master.m3u8";
  var m = f.match(/^https?:\/\/[^/]+\/(?:anime|movie|series|tv)\/(.+?)(?:\/master\.m3u8)?$/);
  var path = m ? m[1] : "";
  if (!path) return { plain: f, tokenized: f, path: "" };
  var tok = mpTokenForPath(path);
  return { plain: f, tokenized: tok ? (f + "?token=" + tok) : f, path: path };
}

var MP_SRC_CACHE_TTL = 10 * 60 * 1000;
var _mpSrcCache = _muState.mpSources || (_muState.mpSources = {});

/**
 * sources JSON for a file id: {file, tracks}. Fail-soft.
 * v2.5.0: sHint selects MegaPlay's own CDN (verified live: null ->
 * megap.shiora.top, "tcdn" -> megap.norami.top, "bcdn" -> megap.shiora.site).
 * The cache key carries the hint so rotation results don't clobber each other.
 */
function mpSources(fileId, sHint) {
  var cacheKey = fileId + ":" + (sHint || "def");
  var hit = _mpSrcCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_SRC_CACHE_TTL) {
    var d0 = hit.data;
    if (d0 && d0.path) {
      try {
        var tk0 = mpTokenForPath(d0.path);
        if (tk0) d0.file = d0.plain + "?token=" + tk0; // v2.9.0: re-sign on cache hits
      } catch (e0) {}
    }
    return Promise.resolve(d0);
  }
  return mpGap().then(function () {
    var url = MEGAPLAY_BASE + "/stream/getSourcesNew?id=" + encodeURIComponent(fileId);
    if (sHint) url += "&s=" + encodeURIComponent(sHint);
    return fetchJson(url, {
      "User-Agent": COMMON_UA,
      "Accept": "application/json",
      "Referer": MEGAPLAY_BASE + "/",
      "X-Requested-With": "XMLHttpRequest"
    }, 6000);
  }).then(function (data) {
    if (!data) return null;
    var file = null;
    if (data.sources && data.sources.file && /^https?:\/\//i.test(String(data.sources.file))) {
      file = String(data.sources.file);            // legacy plain body
    } else if (data.enc) {
      file = mpDecryptFile(String(data.enc));      // v2.9.0: 2026-09 AES body
    }
    if (!file) return null;
    var built = mpTokenizeMaster(file);            // v2.9.0: master needs ?token=
    var out = {
      file: built.tokenized,
      plain: built.plain,
      path: built.path,
      tracks: Array.isArray(data.tracks) ? data.tracks : []
    };
    _mpSrcCache[cacheKey] = { ts: Date.now(), data: out };
    return out;
  }).catch(function () { return null; });
}

// v2.5.0: MegaPlay's own CDN selector values + interchangeable hosts. All
// MegaPlay m3u8 hosts serve IDENTICAL paths, so a host-swap of the returned
// master URL is safe when every selector hint still lands on a blocked host.
var MP_S_HINTS = [null, "tcdn", "bcdn"];
var MP_HOST_SWAPS = []; // v2.9.0: megap.* siblings 404 upstream now (verified
// 2026-09-13); an empty list makes the swap lane return the fail-open unlive
// rows immediately instead of burning 3 x 6s deadlines on dead hosts

/** English/Tagalog subtitle rows from a getSourcesNew tracks[] array. */
function subsFromTracks(tracks) {
  return (tracks || []).filter(function (t) {
    return t && t.file && /^https?:/i.test(String(t.file)) &&
      /(english|filipino|tagalog)/i.test(String(t.label || t.language || ""));
  }).slice(0, 6).map(function (t) {
    var l = String(t.label || t.language || "English");
    var isTl = /filipino|tagalog/i.test(l);
    return {
      url: String(t.file),
      language: isTl ? "tl" : "en",
      name: isTl ? "Tagalog / Filipino" : l
    };
  });
}

function attachSubs(subs, rows) {
  if (subs && subs.length) rows.forEach(function (r) { if (!r.subtitles) r.subtitles = subs; });
  return rows;
}

function rowsFromMaster(masterUrl, res, subs, label, lang, makeRow) {
  var added = [];
  if (res && res.variants && res.variants.length) {
    res.variants.forEach(function (v) { added.push(makeRow(v.url, "", label, lang, v.height)); });
  } else {
    added.push(makeRow(masterUrl, "", label, lang, 0));
  }
  return attachSubs(subs, added);
}

/** One sources response -> rows, plus a reachability verdict. live=true
 *  means the master playlist downloaded on THIS device (or the device at
 *  least answered), so the URLs we emit are the ones that worked here.
 *  v2.6.0: the hlsVariants verdict is memoized MODULE-WIDE per master URL
 *  (3min TTL): anime sources ignore MegaPlay's ?s= selector so several hints
 *  return the IDENTICAL master URL, and the v2.6.0 enriched mal lane sweeps
 *  MegaPlay twice (direct + ani-route) - probing the same blocked URL up to
 *  6x per call wasted the deadline on devices. Negative verdicts are cached
 *  too (a blocked host is re-probed at most once per TTL). */
var MASTER_MEMO_TTL = 3 * 60 * 1000;
var _masterMemo = _muState.masterMemo || (_muState.masterMemo = {});
function masterProbe(url, referer) {
  var key = String(url);
  var hit = _masterMemo[key];
  if (hit && Date.now() - hit.ts < MASTER_MEMO_TTL) {
    return Promise.resolve(hit.res);
  }
  return hlsVariants(url, referer).then(function (res) {
    _masterMemo[key] = { ts: Date.now(), res: res };
    return res;
  });
}

function megaPlayRowsFromSources(src, label, lang, makeRow) {
  var subs = subsFromTracks(src.tracks);
  var master = String(src.file);
  var cached = _masterMemo[master];
  if (cached && Date.now() - cached.ts < MASTER_MEMO_TTL) {
    var r0 = cached.res;
    return Promise.resolve({
      rows: rowsFromMaster(master, r0, subs, label, lang, makeRow),
      live: !!(r0 && r0.ok)
    });
  }
  return hlsVariants(src.file, MEGAPLAY_BASE + "/").then(function (res) {
    _masterMemo[master] = { ts: Date.now(), res: res };
    return {
      rows: rowsFromMaster(src.file, res, subs, label, lang, makeRow),
      live: !!(res && res.ok)
    };
  });
}

/**
 * v2.5.0: one language's rows with device-reachability-driven CDN rotation.
 * Try MegaPlay's selector hints in order; the first hint whose master
 * playlist actually downloads wins. If every hint fails, swap the host on
 * the plain master URL across the interchangeable CDN hosts. If even that
 * fails, return the plain rows anyway (the fail-open post-filter keeps them
 * visible instead of deleting them) - never return "nothing" while MegaPlay
 * itself answered.
 */
function megaPlayRowsSmart(fileId, label, lang, makeRow) {
  var idx = 0;
  // v2.5.0 fix: rows built from a hint whose master we could NOT download are
  // kept here - if every hint and every host-swap fails these are still real
  // MegaPlay URLs (site answered, file id resolved, sources JSON parsed) and
  // the fail-open post-filter keeps them visible instead of returning nothing.
  var unlive = null;
  function attemptHint() {
    if (idx >= MP_S_HINTS.length) return Promise.resolve(null);
    var hint = MP_S_HINTS[idx++];
    return mpSources(fileId, hint).then(function (src) {
      if (!src) return attemptHint();
      return megaPlayRowsFromSources(src, label, lang, makeRow).then(function (out) {
        if (out.live) return out.rows; // master downloaded -> done
        if (out.rows.length && !unlive) unlive = out.rows;
        console.log("[Miruro] master unreachable via " + (hint || "default CDN") +
          " -> rotating CDN hint");
        return attemptHint();
      });
    }).catch(function () { return attemptHint(); });
  }
  return attemptHint().then(function (rows) {
    if (rows && rows.length) return rows;
    // last resort: same path on sibling hosts (paths are host-agnostic)
    return mpSources(fileId, null).then(function (src) {
      if (!src) return unlive || [];
      var m = String(src.file).match(/^(https:\/\/)[^/]+(\/.+)$/);
      if (!m) return unlive || [];
      var subs = subsFromTracks(src.tracks);
      var swaps = MP_HOST_SWAPS.slice();
      function trySwap() {
        if (!swaps.length) return unlive || []; // unlive rows -> fail-open keeps them
        var alt = m[1] + swaps.shift() + m[2];
        return masterProbe(alt, MEGAPLAY_BASE + "/").then(function (res) {
          if (!res || !res.ok) return trySwap();
          console.log("[Miruro] master OK via host swap -> " + alt.split("/")[2]);
          return rowsFromMaster(alt, res, subs, label, lang, makeRow);
        });
      }
      return trySwap();
    }).catch(function () { return unlive || []; });
  });
}

function megaplayLanes(animeIds, epNumber, makeRow, sink) {
  if (!animeIds || (!animeIds.malId && !animeIds.anilistId)) return Promise.resolve([]);
  var langs = ["sub", "dub"];
  var rows = [];
  // v2.1.0: both languages resolve in parallel - the shared paced queue
  // (mpGap) still spaces the actual HTTP calls, but the wall clock halves,
  // which matters on device connections where every hop is slower.
  // v2.5.0: sink(row) pushes each language's rows the moment they resolve.
  return Promise.all(langs.map(function (lang) {
    return mpFileId(animeIds.malId, animeIds.anilistId, epNumber, lang)
      .then(function (fileId) {
          if (!fileId) return;
          var label = "MegaPlay " + (lang === "dub" ? "Dub" : "Sub");
          return megaPlayRowsSmart(fileId, label, lang, makeRow).then(function (added) {
            if (sink && added.length) added.forEach(sink);
            added.forEach(function (r) { rows.push(r); });
          });
        }).catch(function () {});
  })).then(function () { return rows; });
}

// ------------------------------------------------ anikoto / catalog ids

// v2.4.0: MegaPlay file-id resolution through the s-2 route, keyed by the
// Anikoto episode_embed_id (the exact pairing MegaPlay's API docs document).
function mpFileIdFromEmbedId(embedId, lang) {
  var cacheKey = "e" + embedId + ":" + lang;
  var hit = _mpFileCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_FILE_CACHE_TTL) {
    return Promise.resolve(hit.id);
  }
  return mpGap().then(function () {
    return fetchText(MEGAPLAY_BASE + "/stream/s-2/" + encodeURIComponent(embedId) + "/" + lang, {
      "User-Agent": COMMON_UA,
      "Accept": "text/html,*/*",
      "Referer": MEGAPLAY_BASE + "/"
    }, 6000);
  }).then(function (html) {
    if (!html || html.indexOf("Error Code:") !== -1) return null;
    var m = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
            html.match(/data-id="(\d+)"/) ||
            html.match(/<title>File (\d+) - MegaPlay/);
    if (!m) return null;
    _mpFileCache[cacheKey] = { ts: Date.now(), id: m[1] };
    return m[1];
  }).catch(function () { return null; });
}

function anikotoSeries(anikotoId) {
  return fetchJson(ANIKOTO_API + "/series/" + encodeURIComponent(anikotoId), {
    "User-Agent": COMMON_UA, "Accept": "application/json"
  }, 9000).then(function (d) {
    return d && d.data ? d.data : null;
  }).catch(function () { return null; });
}

// v2.6.0: mal -> anilist enrichment for catalog ids. "mal:61240" gains the
// MegaPlay ANI route (same episode, second internal mapping - when one side
// lags behind on a just-aired episode the other still resolves) and the pipe
// lane gets its anilistId. One ani.zip CDN request, cached: hits 24h, misses
// 1h so a temporary gap is retried reasonably soon. Verified live:
// mappings?mal_id=61240 -> anilist 188139; MegaPlay /stream/ani/188139/9 and
// /stream/mal/61240/9 resolve to the SAME file id (179430).
var AZ_MAL_TTL = 24 * 60 * 60 * 1000;
var _azMalCache = _muState.azMal || (_muState.azMal = {});
function anizipFromMal(malId) {
  var key = String(malId);
  var hit = _azMalCache[key];
  if (hit && Date.now() - hit.ts < (hit.ttl || AZ_MAL_TTL)) {
    return Promise.resolve(hit.al);
  }
  return mapGap().then(function () {
    return fetchJson(ANIZIP_BASE + "/mappings?mal_id=" + encodeURIComponent(key), {
      "User-Agent": COMMON_UA, "Accept": "application/json"
    }, 8000);
  }).then(function (data) {
    var al = data && data.mappings && data.mappings.anilist_id != null
      ? parseInt(data.mappings.anilist_id, 10) : null;
    var out = (al && isFinite(al) && al > 0) ? al : null;
    _azMalCache[key] = { ts: Date.now(), al: out, ttl: out ? AZ_MAL_TTL : 60 * 60 * 1000 };
    return out;
  }).catch(function () {
    _azMalCache[key] = { ts: Date.now(), al: null, ttl: 60 * 60 * 1000 };
    return null;
  });
}

// s-2 lanes for one Anikoto episode (sub from episode_embed_id, dub from
// embed_url.dub when the row carries one).
function anikotoS2Lanes(ep, makeRow) {
  var subId = ep.episode_embed_id ? String(ep.episode_embed_id) : "";
  if (!subId && ep.embed_url && ep.embed_url.sub) {
    var sm = String(ep.embed_url.sub).match(/\/s-2\/(\d+)\/sub/);
    if (sm) subId = sm[1];
  }
  var dubId = "";
  if (ep.embed_url && ep.embed_url.dub) {
    var dm = String(ep.embed_url.dub).match(/\/s-2\/(\d+)\/dub/);
    if (dm) dubId = dm[1];
  }
  var langs = [];
  if (subId) langs.push({ lang: "sub", embed: subId });
  if (dubId) langs.push({ lang: "dub", embed: dubId });
  if (!langs.length) return Promise.resolve([]);
  return Promise.all(langs.map(function (l) {
    return mpFileIdFromEmbedId(l.embed, l.lang).then(function (fileId) {
      if (!fileId) return;
      var label = "MegaPlay " + (l.lang === "dub" ? "Dub" : "Sub");
      return megaPlayRowsSmart(fileId, label, l.lang, makeRow);
    }).catch(function () { return null; });
  })).then(function (parts) {
    var rows = [];
    parts.forEach(function (p) { if (p) rows = rows.concat(p); });
    return rows;
  });
}

// "anikoto:{id}" lane: resolve the series once, then run the s-2 embed-id
// lanes AND the mal/ani lanes in parallel (the series response carries
// mal_id/ani_id); dedupe happens in getStreams.
// v2.5.0: third lane - the site secure pipe for ani_id (the pipe is the only
// lane that does not depend on megaplay.buzz being reachable, which is the
// exact failure mode seen on the reporter's device), plus sink(row) pushes
// per lane so one hanging lane cannot delay the others' rows.
function anikotoAllLanes(anikotoId, epNumber, makeRow, sink) {
  return anikotoSeries(anikotoId).then(function (data) {
    if (!data) return { rows: [] };
    var anime = data.anime || {};
    var malId = parseInt(anime.mal_id, 10);
    var aniId = parseInt(anime.ani_id, 10);
    var animeIds = {
      malId: isFinite(malId) && malId > 0 ? malId : null,
      anilistId: isFinite(aniId) && aniId > 0 ? aniId : null
    };
    function push(rows) {
      if (sink && rows && rows.length) rows.forEach(sink);
      return rows;
    }
    var eps = Array.isArray(data.episodes) ? data.episodes : [];
    var ep = null;
    for (var i = 0; i < eps.length; i++) {
      if (parseInt(eps[i] && eps[i].number, 10) === parseInt(epNumber, 10)) { ep = eps[i]; break; }
    }
    var s2 = ep ? anikotoS2Lanes(ep, makeRow).then(push) : Promise.resolve([]);
    var mp = (animeIds.malId || animeIds.anilistId)
      ? megaplayLanes(animeIds, epNumber, makeRow, sink).then(push)
      : Promise.resolve([]);
    var pp = animeIds.anilistId
      ? pipeLanes(animeIds.anilistId, epNumber, makeRow, sink).then(push)
      : Promise.resolve([]);
    return Promise.all([s2, mp, pp]).then(function (parts) {
      return { rows: parts[0].concat(parts[1]).concat(parts[2]) };
    });
  });
}

// "kitsu:{id}" -> {malId, anilistId} via the mappings relationship.
function kitsuById(kitsuId) {
  var url = KITSU_BASE + "/anime/" + encodeURIComponent(kitsuId) + "?include=mappings";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/vnd.api+json" }, 10000);
  }).then(function (data) {
    if (!data || !data.data) return null;
    var mapIds = {};
    (data.included || []).forEach(function (inc) {
      if (inc && inc.type === "mappings" && inc.attributes) {
        var site = String(inc.attributes.externalSite || "");
        if (site === "myanimelist/anime") mapIds.mal = inc.attributes.externalId;
        else if (site === "anilist/anime") mapIds.ali = inc.attributes.externalId;
      }
    });
    if (!mapIds.mal && !mapIds.ali) return null;
    return { malId: mapIds.mal || null, anilistId: mapIds.ali || null, via: "kitsu-id" };
  }).catch(function () { return null; });
}

/** Fetch a master m3u8; v2.5.0 returns {ok, variants} - ok=true means the
 *  master actually downloaded on this device (reachability signal used by
 *  the CDN rotation). variants max 4, best first. */
function hlsVariants(masterUrl, referer) {
  return fetchText(masterUrl, { "User-Agent": COMMON_UA, "Referer": referer }, 5000)
    .then(function (master) {
      if (!master || master.indexOf("#EXTM3U") === -1) return { ok: true, variants: [] };
      var lines = master.split(/\r?\n/), out = [];
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        var resM = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        var url = "";
        for (var j = i + 1; j < lines.length; j++) {
          var t = lines[j].trim();
          if (t && t.charAt(0) !== "#") { url = t; break; }
        }
        if (!url) continue;
        if (!/^https?:\/\//i.test(url)) {
          url = masterUrl.replace(/[^/]*$/, url);
        }
        var h = resM ? parseInt(resM[2], 10) : 0;
        out.push({ url: url, height: h });
      }
      out.sort(function (a, b) { return b.height - a.height; });
      return { ok: true, variants: out.slice(0, 4) };
    }).catch(function () { return { ok: false, variants: [] }; });
}

// ---------------------------------------------------- TMDB -> anime map

function tmdbInfo(tmdbId, mediaType) {
  var endpoint = mediaType === "tv" ? "tv" : "movie";
  var url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetchJson(url, null, 7000).then(function (data) {
    if (!data) throw new Error("tmdb unreachable");
    var title = mediaType === "tv" ? (data.name || data.original_name) : (data.title || data.original_title);
    var original = mediaType === "tv" ? (data.original_name || data.name) : (data.original_title || data.title);
    var date = mediaType === "tv" ? data.first_air_date : data.release_date;
    if (!title) throw new Error("tmdb: no title");
    return {
      title: title,
      original: original || title,
      year: date ? parseInt(String(date).split("-")[0], 10) : null
    };
  });
}

/** Air year of one TMDB season (for validating season-specific entries). */
function tmdbSeasonYear(tmdbId, season) {
  return fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + TMDB_API_KEY, null, 9000)
    .then(function (d) {
      var a = d && d.air_date ? String(d.air_date).split("-")[0] : null;
      return a ? parseInt(a, 10) : null;
    }).catch(function () { return null; });
}

function anilistSearchPost(title, year) {
  var query = 'query ($search: String, $year: Int) {' +
    ' Media(search: $search, seasonYear: $year, type: ANIME,' +
    ' format_in: [TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL]) {' +
    ' id idMal title { romaji english native } seasonYear } }';
  var body = JSON.stringify({ query: query, variables: { search: title, year: year } });
  if (!hasTimers()) {
    return fetch("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body
    }).then(function (res) { return res.json(); });
  }
  return new Promise(function (resolve, reject) {
    // v2.2.0: 5s (was 8s) - AniList has been unstable for days; a hung
    // attempt must not eat the device stream deadline.
    var timer = setTimeout(function () { reject(new Error("anilist timeout")); }, 5000);
    fetch("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body
    }).then(function (res) {
      clearTimeout(timer);
      res.json().then(resolve, reject);
    }, function (e) { clearTimeout(timer); reject(e); });
  });
}

// v2.2.0: AniList circuit breaker - one failure (403 outage / timeout / CF
// challenge) benches it for 15 minutes so no device request pays for it again.
var ANILIST_COOLDOWN_MS = 15 * 60 * 1000;
var _anilistDown = _muState.anilistDown || (_muState.anilistDown = { until: 0 });
function anilistAvailable() { return Date.now() >= _anilistDown.until; }
function markAnilistDown() {
  _anilistDown.until = Date.now() + ANILIST_COOLDOWN_MS;
  console.log("[Miruro] AniList benched for 15 min");
}

function anilistFromPost(data) {
  if (data && data.data && data.data.Media && data.data.Media.id) {
    return {
      anilistId: data.data.Media.id,
      malId: data.data.Media.idMal || null,
      via: "anilist"
    };
  }
  return null;
}

function asciiFold(s) {
  var t = String(s || "");
  // NFD-decompose diacritics (u+016B -> u+0304 -> strip) so macron'd titles
  // like "Shippuden" (TMDB) match "Shippuuden" romaji (Kitsu/MAL).
  if (typeof t.normalize === "function") {
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  }
  return t;
}

function normTitleForMatch(s) {
  return asciiFold(s).toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d']/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// romaji variants: "shippuuden" == "shippuden" once doubled vowels collapse
function collapseRomaji(s) {
  return String(s || "").replace(/([aeou])\1+/g, "$1").replace(/ou/g, "o");
}

function yearClose(a, b) {
  return a && b && Math.abs(parseInt(a, 10) - parseInt(b, 10)) <= 1;
}

/** Kitsu title search -> {malId, anilistId} via the mappings relationship. */
function kitsuSearch(query, year) {
  var url = KITSU_BASE + "/anime?filter[text]=" + encodeURIComponent(query) +
    "&page[limit]=5&include=mappings";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/vnd.api+json" }, 10000);
  }).then(function (data) {
      if (!data || !Array.isArray(data.data) || !data.data.length) return null;
      var mapIds = {};
      (data.included || []).forEach(function (inc) {
        if (inc && inc.type === "mappings" && inc.attributes) {
          var site = String(inc.attributes.externalSite || "");
          if (site === "myanimelist/anime") mapIds[inc.id] = { mal: inc.attributes.externalId };
          else if (site === "anilist/anime") mapIds[inc.id] = { ali: inc.attributes.externalId };
        }
      });
      var want = normTitleForMatch(query.replace(/\s+(season|2nd|3rd|4th|5th)\b.*$/i, " "));
      var wantR = collapseRomaji(want);
      var best = null;
      for (var i = 0; i < data.data.length && !best; i++) {
        var a = data.data[i];
        var attrs = a.attributes || {};
        var start = attrs.startDate ? parseInt(String(attrs.startDate).split("-")[0], 10) : null;
        var yearOk = year ? (start ? yearClose(start, year) : true) : true;
        var titles = [attrs.canonicalTitle, attrs.titles && attrs.titles.en,
          attrs.titles && attrs.titles.en_jp, attrs.titles && attrs.titles.ja_jp];
        var titleOk = titles.some(function (t) {
          var nt = normTitleForMatch(t);
          if (!nt) return false;
          if (nt.indexOf(want) !== -1 || want.indexOf(nt) !== -1) return true;
          var cn = collapseRomaji(nt);
          return wantR.length > 3 && cn === wantR;
        });
        if (!titleOk || !yearOk) continue;
        var malId = null, aliId = null;
        var rels = a.relationships && a.relationships.mappings && a.relationships.mappings.data;
        if (Array.isArray(rels)) {
          rels.forEach(function (rr) {
            if (mapIds[rr.id]) {
              if (mapIds[rr.id].mal) malId = mapIds[rr.id].mal;
              if (mapIds[rr.id].ali) aliId = mapIds[rr.id].ali;
            }
          });
        }
        if (malId || aliId) best = { anilistId: aliId, malId: malId, via: "kitsu" };
      }
      return best;
    }).catch(function () { return null; });
}

/** Jikan (MyAnimeList) title search -> {malId}. Last title fallback. */
function jikanSearch(query, year) {
  var url = JIKAN_BASE + "/anime?q=" + encodeURIComponent(query) + "&limit=5&sfw=true";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/json" }, 10000);
  }).then(function (data) {
      if (!data || !Array.isArray(data.data) || !data.data.length) return null;
      var want = normTitleForMatch(query.replace(/\s+(season|2nd|3rd|4th|5th)\b.*$/i, " "));
      var wantR = collapseRomaji(want);
      for (var i = 0; i < data.data.length; i++) {
        var a = data.data[i];
        var yr = a.year || (a.aired && a.aired.from ? parseInt(String(a.aired.from).split("-")[0], 10) : null);
        var yearOk = year ? (yr ? yearClose(yr, year) : true) : true;
        var titles = [a.title, a.title_english, a.title_japanese];
        var titleOk = titles.some(function (t) {
          var nt = normTitleForMatch(t);
          if (!nt) return false;
          if (nt.indexOf(want) !== -1 || want.indexOf(nt) !== -1) return true;
          var cn = collapseRomaji(nt);
          return wantR.length > 3 && cn === wantR;
        });
        if (titleOk && yearOk && a.mal_id) return { anilistId: null, malId: a.mal_id, via: "jikan" };
      }
      return null;
    }).catch(function () { return null; });
}

/** v2.3.0: deterministic TMDB-keyed mapping via ani.zip. One CDN request
 *  replaces the whole title-search chain whenever ani.zip lists the TMDB id.
 *  Fail-soft: null on miss/timeout, never rejects. */
function aniZipFromTmdb(tmdbId) {
  var url = ANIZIP_BASE + "/mappings?themoviedb_id=" + encodeURIComponent(tmdbId);
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/json" }, 8000);
  }).then(function (data) {
    if (!data || !data.mappings) return null;
    var m = data.mappings;
    var mal = m.mal_id == null ? null : parseInt(m.mal_id, 10);
    var ali = m.anilist_id == null ? null : parseInt(m.anilist_id, 10);
    if (!mal && !ali) return null;
    console.log("[Miruro] ani.zip tmdb " + tmdbId + " -> mal " + mal + " / anilist " + ali);
    return { malId: mal, anilistId: ali, via: "anizip" };
  }).catch(function () { return null; });
}

var ORDINALS = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th" };

/**
 * Season-aware mapping: TMDB ids arrive with a season number. For season 2+
 * a season-specific MAL/AniList entry is searched first (validated with the
 * TMDB season air year); when none is found the caller falls back to the
 * base entry with an absolute episode number.
 *
 * Returns {anilistId, malId, matched: "season"|"base"|null, via}.
 * Results are cached per (tmdbId, isTv, season) with a 6h TTL.
 */
/** v2.2.0: hard deadline - resolve to null after ms so a hung phase cannot
    stall the whole provider (late results still flow into caches). */
function withDeadline(promise, ms) {
  if (!hasTimers()) return promise;
  return Promise.race([promise, new Promise(function (resolve) {
    var t = setTimeout(function () { resolve(null); }, ms);
    if (typeof t === "object" && typeof t.unref === "function") t.unref();
  })]);
}

function mapTMDBToAnime(tmdbId, isTv, info, season) {
  season = parseInt(season || 1, 10);
  var mapKey = (isTv ? "tv" : "mv") + ":" + tmdbId + ":" + season;
  var hit = _mapCache[mapKey];
  if (hit && Date.now() - hit.ts < MAP_CACHE_TTL) {
    return Promise.resolve(hit.res);
  }
  var uncapped = mapTMDBToAnimeUncached(tmdbId, isTv, info, season);
  // late mappings still get cached for the next episode
  uncapped.then(function (res) {
    if (res) _mapCache[mapKey] = { ts: Date.now(), res: res };
  }).catch(function () {});
  // v2.2.0: the mapping phase can never hold the provider hostage; v2.5.0:
  // trimmed to 8s so the lanes get room under the 10.5s overall deadline
  return withDeadline(uncapped, 8000).catch(function () { return null; });
}

function mapTMDBToAnimeUncached(tmdbId, isTv, info, season) {
  season = parseInt(season || 1, 10);
  var base = info.original || info.title;
  // v2.3.0 "use tmdb for miruro": ani.zip is the PRIMARY lane - keyed by the
  // exact TMDB id Nuvio passes (deterministic, no title fuzzing, works while
  // AniList is 403-down). The title-search cluster is a FALLBACK that starts
  // after a 2s grace and is skipped entirely when ani.zip already won.
  var anizipJob = aniZipFromTmdb(tmdbId);
  if (!isTv || season <= 1) {
    return new Promise(function (resolve) {
      var settled = false, clusterStarted = false;
      function finish(r) { if (!settled) { settled = true; resolve(r); } }
      function startCluster() {
        if (clusterStarted || settled) return; // settled => ani.zip won; no fallback HTTP
        clusterStarted = true;
        console.log("[Miruro] ani.zip miss -> title-search fallback (kitsu/jikan/anilist)");
        var jobs = [];
        if (anilistAvailable()) {
          jobs.push(
            anilistSearchPost(info.title, info.year).then(anilistFromPost)
              .catch(function (e) { markAnilistDown(); return null; })
          );
        }
        jobs.push(
          kitsuSearch(info.title, info.year).then(function (k) {
            return k || jikanSearch(info.title, info.year);
          })
        );
        Promise.all(jobs).then(function (rs) {
          for (var i = 0; i < rs.length; i++) {
            if (rs[i]) { finish({ anilistId: rs[i].anilistId, malId: rs[i].malId, via: rs[i].via, matched: "base" }); return; }
          }
          finish(null);
        }).catch(function () { finish(null); });
      }
      anizipJob.then(function (r) {
        if (r) finish({ anilistId: r.anilistId, malId: r.malId, via: r.via, matched: "base" });
        else startCluster(); // miss -> no point waiting out the grace timer
      }).catch(function () { startCluster(); });
      if (hasTimers()) {
        var t = setTimeout(startCluster, 2000);
        if (typeof t === "object" && typeof t.unref === "function") t.unref();
      } else {
        startCluster();
      }
    });
  }
  // S2+: try a season-specific entry (Jikan/Kitsu handle "... 2nd Season"
  // titles well; AniList search is too fuzzy for seasons). Keep the matrix
  // small (<=3 searches): the mapping APIs throttle rapid bursts.
  return tmdbSeasonYear(tmdbId, season).then(function (sYear) {
    var ord = ORDINALS[season] || season;
    var cands = [];
    if (sYear) {
      cands.push({ q: base + " season " + season, y: sYear });
      cands.push({ q: base + " " + ord + " season", y: sYear });
    }
    if (info.year && info.year !== sYear) {
      cands.push({ q: base + " season " + season, y: info.year });
    }
    var chain = Promise.resolve(null);
    cands.forEach(function (c) {
      chain = chain.then(function (r) {
        if (r) return r;
        return jikanSearch(c.q, c.y).then(function (j) { return j || kitsuSearch(c.q, c.y); });
      });
    });
    return chain.then(function (r) {
      if (r) return { anilistId: r.anilistId, malId: r.malId, via: r.via, matched: "season" };
      // season entry not found -> base entry + absolute episode (caller);
      // v2.3.0: the ani.zip base mapping is already in flight (started above)
      // and usually resolved while the season searches ran - use it first,
      // then AniList (only when not benched), then Kitsu.
      return anizipJob.then(function (az) {
        if (az) return { anilistId: az.anilistId, malId: az.malId, via: az.via, matched: "base" };
        var baseJob = anilistAvailable()
          ? anilistSearchPost(info.title, info.year).then(anilistFromPost)
              .catch(function () { markAnilistDown(); return null; })
          : Promise.resolve(null);
        return baseJob.then(function (r2) {
          if (r2) return { anilistId: r2.anilistId, malId: r2.malId, via: r2.via, matched: "base" };
          return kitsuSearch(info.title, info.year).then(function (k) {
            return k ? { anilistId: k.anilistId, malId: k.malId, via: k.via, matched: "base" } : null;
          });
        });
      });
    });
  });
}

/** Multi-season TMDB entries: absolute episode number across seasons. */
function absoluteEpisode(tmdbId, season, episode) {
  season = parseInt(season || 1, 10);
  episode = parseInt(episode || 1, 10);
  if (season <= 1) return Promise.resolve(episode);
  var seasons = [];
  for (var s = 1; s < season; s++) seasons.push(s);
  var jobs = seasons.map(function (s) {
    return fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + s + "?api_key=" + TMDB_API_KEY, null, 9000)
      .then(function (d) { return (d && d.episodes && d.episodes.length) || 0; })
      .catch(function () { return 0; });
  });
  return Promise.all(jobs).then(function (counts) {
    var total = 0;
    counts.forEach(function (c) { total += c; });
    console.log("[Miruro] absolute episode: " + (total + episode) + " (+" + total + " prior)");
    return total + episode;
  }).catch(function () { return episode; });
}

// ----------------------------------------------------------------- core

// v2.7.0: tolerant catalog-id parser. Nuvio hands the stream provider the
// TAPPED EPISODE's id for series (Stremio protocol: the meta's videos[].id,
// "mal:61240:1:9") and the bare meta id for movies; shapes seen in the wild
// across this repo's parsers: urlencoded (%3A), "/"-separated (TVSmart path
// style), a trailing ".json", and query/hash junk. Returns
// { prefix, id, season, episode } (season/episode = 0 when absent) or null.
function parseCatalogAnimeId(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  if (s.indexOf("%") >= 0) {
    try { var dec = decodeURIComponent(s); if (dec) s = dec; } catch (e) {}
  }
  s = String(s).trim();
  var h = s.indexOf("#"); if (h >= 0) s = s.slice(0, h);
  var q = s.indexOf("?"); if (q >= 0) s = s.slice(0, q);
  s = s.replace(/\.json([^.].*)?$/i, "").replace(/\.json$/i, "").trim();
  if (!s) return null;
  var tokens = s.split(/[:\\/]/);
  var PREFIX = { mal: 1, anilist: 1, kitsu: 1, anikoto: 1 };
  for (var i = tokens.length - 2; i >= 0; i--) {
    var t = String(tokens[i] || "").toLowerCase().trim();
    if (!PREFIX[t]) continue;
    var idTok = String(tokens[i + 1] || "").trim();
    if (!/^\d+$/.test(idTok)) continue;
    var out = { prefix: t, id: idTok, season: 0, episode: 0 };
    var n1 = parseInt(String(tokens[i + 2] == null ? "" : tokens[i + 2]).trim(), 10);
    var n2 = parseInt(String(tokens[i + 3] == null ? "" : tokens[i + 3]).trim(), 10);
    if (isFinite(n1) && n1 > 0 && isFinite(n2) && n2 > 0) { out.season = n1; out.episode = n2; }
    else if (isFinite(n1) && n1 > 0) { out.episode = n1; }
    return out;
  }
  return null;
}

function getStreams(tmdbId, mediaType, season, episode) {
  try { tmdbId = String(tmdbId == null ? "" : tmdbId); } catch (e) { tmdbId = ""; }
  if (!tmdbId) return Promise.resolve([]);
  // v2.7.0: mediaType-slot detection (animotvslash/pinoyhub pattern). The
  // 4-arg Nuvio contract is (id, type, season, episode); legacy 3-arg
  // callers pass (id, season, episode) - detect which shape arrived so
  // season/episode can never shift by one slot.
  var mtSlot = String(mediaType == null ? "" : mediaType).toLowerCase();
  if (mtSlot !== "movie" && mtSlot !== "tv" && mtSlot !== "series" &&
      mtSlot !== "show" && mtSlot !== "tv_show" && mtSlot !== "tvshow") {
    // slot 2 is not a media type: legacy 3-arg (or garbage) - shift left
    if (mediaType !== undefined && mediaType !== null && mtSlot !== "") {
      episode = season;
      season = mediaType;
      mediaType = undefined;
    }
  }
  var argSeason = season, argEpisode = episode;
  // NuvioTV legacy paths may pass "series"/"show" verbatim (see asianhub.js)
  var isTv = mediaType === "tv" || mediaType === "series" || mediaType === "show";
  season = parseInt(season || 1, 10) || 1;
  episode = parseInt(episode || 1, 10) || 1;
  var key = cacheKey(tmdbId, mediaType, season, episode);
  var hit = _muState.cache[key];
  if (hit && Date.now() - hit.ts < (hit.ttl || CACHE_TTL)) return Promise.resolve(hit.streams);
  if (_muState.inflight[key]) return _muState.inflight[key];

  console.log("[Miruro] start " + mediaType + " " + tmdbId +
    (isTv ? " S" + season + "E" + episode : ""));

  function makeRow(url, qualityLabel, sourceName, category, height) {
    var q = "";
    var s = String(qualityLabel || "").toLowerCase();
    if (/2160|4k/.test(s)) q = "4K";
    else if (/1440/.test(s)) q = "1440p";
    else if (/1080/.test(s)) q = "1080p";
    else if (/720/.test(s)) q = "720p";
    else if (height) {
      if (height >= 2100) q = "4K";
      else if (height >= 1300) q = "1440p";
      else if (height >= 1000) q = "1080p";
      else if (height >= 640) q = "720p";
    }
    var lane = category === "dub" ? "Dub" : (category === "sub" ? "Sub" : "");
    var name = "Miruro | " + sourceName + (lane ? " | " + lane : "") + (q ? " | " + q : "");
    return {
      name: name,
      title: name,
      url: url,
      quality: q,
      headers: { Referer: MEGAPLAY_BASE + "/" },
      _megaplay: sourceName.indexOf("MegaPlay") === 0
    };
  }

  // v2.5.0: every lane pushes its rows into `collected` the moment it
  // finishes. The overall deadline (below) flushes whatever is already
  // collected instead of letting one slow lane starve the response.
  var collected = [];
  function sinkRow(r) { collected.push(r); }
  function tap(p) {
    return Promise.resolve(p).then(function (rows) {
      (rows || []).forEach(function (r) { collected.push(r); });
      return rows;
    }).catch(function () { return []; });
  }

  // v2.4.0: catalog-issued anime ids ("mal:52991", "anilist:154587",
  // "kitsu:46474", "anikoto:8952") skip the TMDB-mapping phase entirely.
  // v2.7.0: they do NOT arrive verbatim - series taps deliver the episode
  // id "mal:61240:1:9" (urlencoded/path/.json variants seen too). Tolerant
  // parse; the id-suffix season/episode are used only when the explicit
  // args are missing so the 4-arg Nuvio contract stays authoritative.
  var pm = parseCatalogAnimeId(tmdbId);
  var lanes;
  if (pm) {
    var prefix = pm.prefix;
    var catId = pm.id;
    if (!(parseInt(argEpisode, 10) > 0) && pm.episode > 0) episode = pm.episode;
    if (!(parseInt(argSeason, 10) > 0) && pm.season > 0) season = pm.season;
    console.log("[Miruro] start catalog id " + prefix + ":" + catId +
      (isTv ? " S" + season + "E" + episode : "") + " -> direct MegaPlay lane");
    var catEp = episode; // anime numbering is flat (season 1 per the meta addon)
    var catLanes;
    if (prefix === "mal") {
      // v2.6.0: the mal route starts IMMEDIATELY (no serial ani.zip hop on the
      // fast path). In parallel, ani.zip enriches the AniList id; when it
      // lands, the ani route + pipe lane join (mpFileId/mpSources caches make
      // the second MegaPlay sweep near-free). Rows dedupe in getStreams.
      var mpNow = tap(megaplayLanes({ malId: catId, anilistId: null }, catEp, makeRow, sinkRow));
      var enrich = anizipFromMal(catId).then(function (al) {
        if (!al) return [];
        console.log("[Miruro] mal:" + catId + " enriched with anilist " + al + " (ani.zip) -> ani route + pipe");
        var mp2 = tap(megaplayLanes({ malId: catId, anilistId: al }, catEp, makeRow, sinkRow));
        var pp = tap(pipeLanes(al, catEp, makeRow, sinkRow));
        return Promise.all([mp2, pp]).then(function (parts) {
          return parts[0].concat(parts[1]);
        });
      }).catch(function () { return []; });
      catLanes = [mpNow, enrich];
    } else if (prefix === "anilist") {
      catLanes = [
        megaplayLanes({ malId: null, anilistId: catId }, catEp, makeRow, sinkRow),
        pipeLanes(catId, catEp, makeRow, sinkRow)
      ];
    } else if (prefix === "kitsu") {
      catLanes = [kitsuById(catId).then(function (ids) {
        if (!ids) return [];
        console.log("[Miruro] kitsu " + catId + " -> mal " + ids.malId + " / anilist " + ids.anilistId);
        var mp = tap(megaplayLanes(ids, catEp, makeRow, sinkRow));
        var pp = ids.anilistId ? tap(pipeLanes(ids.anilistId, catEp, makeRow, sinkRow)) : Promise.resolve([]);
        return Promise.all([mp, pp]).then(function (parts) { return parts[0].concat(parts[1]); });
      })];
    } else {
      catLanes = [anikotoAllLanes(catId, catEp, makeRow, sinkRow).then(function (out) {
        return out && out.rows ? out.rows : [];
      })];
    }
    lanes = catLanes.map(tap);
  } else {
    lanes = [tap(tmdbInfo(tmdbId, isTv ? "tv" : "movie").then(function (info) {
    // mapTMDBToAnime never rejects (null on total mapping outage)
    return mapTMDBToAnime(tmdbId, isTv, info, isTv ? season : 1).then(function (animeIds) {
      if (animeIds) {
        console.log("[Miruro] mapped via " + animeIds.via + " (" + animeIds.matched + "): " +
          "anilist " + animeIds.anilistId + " / mal " + animeIds.malId);
      } else {
        console.log("[Miruro] no mapping from any source");
      }
      var epP;
      if (!isTv) {
        epP = Promise.resolve(1);
      } else if (animeIds && animeIds.matched === "season") {
        // season-specific MAL/AniList entry: episode numbers restart at 1
        epP = Promise.resolve(episode);
      } else {
        // base entry only: flatten multi-season TMDB to absolute episode
        epP = absoluteEpisode(tmdbId, season, episode);
      }
      return epP.then(function (epNumber) {
        // v2.5.0: inner tap()s + sinkRow - pipe rows land in `collected` the
        // moment they resolve even if the MegaPlay lane is still hanging
        var a = tap(megaplayLanes(animeIds, epNumber, makeRow, sinkRow));
        var b = animeIds && animeIds.anilistId
          ? tap(pipeLanes(animeIds.anilistId, epNumber, makeRow, sinkRow))
          : Promise.resolve([]);
        return Promise.all([a, b]).then(function (parts) {
          return parts[0].concat(parts[1]);
        });
      });
    });
    }))];
  }
  // v2.5.0: overall deadline. Whichever comes first wins: all lanes done,
  // or 10.5s with the rows collected so far. This is what keeps one
  // blackholed host from burning the app-level stream timeout.
  var run = Promise.all(lanes).then(function (parts) {
    return parts.reduce(function (acc, p) { return acc.concat(p || []); }, []);
  });
  if (hasTimers()) {
    run = Promise.race([
      run,
      new Promise(function (resolve) {
        var t = setTimeout(function () { resolve("__mp_deadline__"); }, 10500);
        if (typeof t === "object" && t && typeof t.unref === "function") t.unref();
      })
    ]);
  }
  run = run.then(function (out) {
    var rows = out === "__mp_deadline__" ? collected : out;
    if (out === "__mp_deadline__") {
      console.log("[Miruro] deadline hit -> flushing " + collected.length + " collected row(s)");
    }
    var seen = {}, outRows = [];
    rows.forEach(function (r) {
      var nu = String(r.url).replace(/[#?].*$/, "");
      if (seen[nu]) return;
      seen[nu] = 1;
      outRows.push(r);
    });
    console.log("[Miruro] returning " + outRows.length + " stream(s)");
    return outRows;
  }).catch(function (error) {
    console.log("[Miruro] failed: " + (error && error.message ? error.message : error));
    return [];
  }).then(function (streams) {
    delete _muState.inflight[key];
    // v2.5.0: the stream cache is finally WRITTEN. Successes keep the full
    // TTL; empty results only 60s so a recovered network retries soon.
    _muState.cache[key] = { ts: Date.now(), streams: streams, ttl: streams.length ? CACHE_TTL : 60000 };
    return streams;
  });
  _muState.inflight[key] = run;
  return run;
}

module.exports = {
  getStreams: getStreams,
  parseCatalogAnimeId: parseCatalogAnimeId
};

/* ===== nvio post-filter v1.0 (auto-injected) ============================
   Rules (per user request 2026-09):
   1. Language gate: only English / Tagalog (Filipino) audio lanes are kept.
      Streams explicitly tagged with another audio language (hindi, tamil,
      spanish, arabic, korean, ...) are dropped unless an allowed language
      is also present (dual/multi audio) or no language is tagged at all.
      Subtitle-only tokens (ESub, HindiSub, ...) are ignored by the gate.
   2. Quality gate: unknown/"Auto" resolutions are probed from the HLS
      master playlist; everything below 720p, CAM/telesync, and still-
      unknown rows are dropped. Survivors are labeled 720p/1080p/1440p/4K.
   3. Dedupe: exact URL, then normalized URL (query stripped, torrent
      info-hash), then identical name+quality rows. A short-TTL global
      registry also removes the same URL reported by two different
      providers (cross-provider duplicates).
   Opt-out: set SCRAPER_SETTINGS.postFilter = false.
======================================================================== */
(function () {
  var PROVIDER = "miruro";
  var G = typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : this;
  function settings() {
    try { return (G && G.SCRAPER_SETTINGS) || {}; } catch (e) { return {}; }
  }
  function hasTimers() { return typeof setTimeout === "function" && typeof clearTimeout === "function"; }

  /* ---------- quality ---------- */
  function normQ(q) {
    var s = String(q == null ? "" : q).toLowerCase();
    if (!s) return "";
    if (/8k/.test(s)) return "4K";
    if (/2160|4k|uhd/.test(s)) return "4K";
    if (/1440/.test(s)) return "1440p";
    if (/1080|fhd/.test(s)) return "1080p";
    if (/720/.test(s)) return "720p";
    if (/480|360|240|\bsd\b/.test(s)) return "CAM";
    if (/cam|telesync|telecine|\bts\b|\btc\b|screener|dvdscr/.test(s)) return "CAM";
    return "";
  }
  function qFromText(text) {
    var s = String(text || "");
    var m = s.match(/(\d{3,4})\s*p/i);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n >= 2100) return "4K";
      if (n >= 1300) return "1440p";
      if (n >= 1000) return "1080p";
      if (n >= 640) return "720p";
      return "CAM";
    }
    if (/\b8k\b/i.test(s) || /2160|4k|uhd/i.test(s)) return "4K";
    if (/1440p/i.test(s)) return "1440p";
    if (/cam|telesync|telecine|\bts\b|\btc\b|screener|dvdscr/i.test(s)) return "CAM";
    if (/480p|360p|240p|\bsd\b|\bdvdrip\b/i.test(s)) return "CAM";
    if (/\bhd\b/i.test(s)) return "720p";
    return "";
  }
  var qualCache = G.__NV_QUAL_CACHE__ || (G.__NV_QUAL_CACHE__ = {});
  // v2.5.0 (miruro copy): the probe is now FAIL-OPEN. A probe request that
  // ERRORS or times out returns the sentinel "ERR" and the row is KEPT
  // (untagged) instead of deleted - a network failure is not evidence the
  // stream is bad. Only a probe that SUCCEEDS and still finds no resolution
  // info ("") or finds SD/CAM ladders ("CAM") drops the row.
  function probeM3u8(url, headers) {
    var now = Date.now();
    var c = qualCache[url];
    if (c && now - c.t < (c.q && c.q !== "ERR" ? 15 * 60 * 1000 : 3 * 60 * 1000)) {
      return Promise.resolve(c.q);
    }
    var opts = { headers: Object.assign({}, headers || {}) };
    var p = fetch(url, opts).then(function (r) {
      if (!r.ok) return Promise.reject(new Error("HTTP " + r.status));
      return r.text();
    }).then(function (t) {
      var q = "";
      if (t && t.indexOf("#EXTM3U") !== -1) {
        var best = 0, re = /RESOLUTION=(\d+)x(\d+)/gi, m;
        while ((m = re.exec(t)) !== null) {
          var h = parseInt(m[2], 10);
          if (h > best) best = h;
        }
        if (best >= 2100) q = "4K";
        else if (best >= 1300) q = "1440p";
        else if (best >= 1000) q = "1080p";
        else if (best >= 640) q = "720p";
        else if (best > 0) q = "CAM";
      }
      qualCache[url] = { t: now, q: q };
      return q;
    }).catch(function () { qualCache[url] = { t: now, q: "ERR" }; return "ERR"; });
    if (hasTimers()) {
      p = Promise.race([p, new Promise(function (res) {
        // 3.5s: the probe only ENRICHES quality now (fail-open), so a slow
        // probe must not stretch the response; the row survives as "ERR".
        var timer = setTimeout(function () { res("ERR"); }, 3500);
        if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
      })]);
    }
    return p;
  }

  /* ---------- language gate ---------- */
  var BLOCK_RE = new RegExp(
    "\\b(hindi|hin|tamil|telugu|malayalam|mallu|kannada|bengali|bangla|punjabi|marathi|bhojpuri|gujarati|" +
    "odia|assamese|nepali|urdu|sinhala|arabic|ara|farsi|persian|turkish|turkce|espanol|spanish|latino|" +
    "castellano|french|vostfr|german|deutsch|russian|korean|kor|japanese|jpn|chinese|mandarin|cantonese|" +
    "thai|vietnamese|indonesian|bahasa|portuguese|brasileiro|italian|polish|ukrainian|hebrew|" +
    "hungarian|romanian|dutch|flemish|greek|czech|swedish|danish|norwegian|finnish|org)\\b", "i");
  var ALLOW_RE = /\b(english|eng|tagalog|filipino)\b/i;
  var SUB_RE = /\b[a-z0-9]{0,12}subs?\b/gi;
  // NOTE: gate runs on the stream TITLE only (release names / labels).
  // Provider names (e.g. "MallumV") must not trigger the language gate.
  function langAllowed(titleText) {
    var t = String(titleText || "").replace(SUB_RE, " ");
    if (BLOCK_RE.test(t)) return ALLOW_RE.test(t);
    return true;
  }

  /* ---------- dedupe ---------- */
  function normUrl(u) {
    var s = String(u || "");
    if (/^magnet:/i.test(s)) {
      var m = s.match(/btih:([a-z0-9]+)/i);
      return "m:" + (m ? m[1].toLowerCase() : s.slice(0, 80));
    }
    return s.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
  var SEEN = G.__NV_SEEN_URLS__ || (G.__NV_SEEN_URLS__ = {});
  // SEEN[nu] = { exp: <ts>, owner: <provider> }
  // - same URL from a DIFFERENT provider within TTL -> dropped (cross-provider dup)
  // - same provider re-querying its own URL -> allowed (repeat opens must still
  //   return rows) and its claim is refreshed
  function claim(nu, now, owner) {
    if (!nu) return true;
    var e = SEEN[nu];
    if (e && e.exp > now && e.owner !== owner) return false;
    SEEN[nu] = { exp: now + 120000, owner: owner };
    return true;
  }

  /* ---------- main ---------- */
  function rank(q) {
    if (q === "4K") return 4;
    if (q === "1440p") return 3.5;
    if (q === "1080p") return 3;
    if (q === "720p") return 2;
    return 0;
  }
  function postProcess(list) {
    var now = Date.now();
    var kept = [];
    var probes = [];
    var rows = [];
    (list || []).forEach(function (s, i) {
      if (!s || !s.url) return;
      if (!langAllowed(s.title)) return;
      var text = (s.name || "") + " " + (s.title || "");
      var isMagnet = /^magnet:/i.test(String(s.url));
      var q = normQ(s.quality) || normQ(String(s.title || "").split("\n")[0]) || qFromText(text);
      var isHlsLike = /m3u8/i.test(String(s.url)) ||
        (!/\.(mp4|mkv|avi|mov|webm|ts|flv|m4v|mp3|aac)(\?|$)/i.test(String(s.url.split("?")[0])) && /^https?:/i.test(String(s.url)));
      if (!q && !isMagnet && isHlsLike) {
        rows.push({ s: s, i: i });
        probes.push(probeM3u8(String(s.url), s.headers));
      } else {
        rows.push({ s: s, i: i });
        probes.push(Promise.resolve(q));
      }
    });
    return Promise.all(probes).then(function (qs) {
      var ranked = [];
      rows.forEach(function (row, k) {
        var q = qs[k];
        if (q === "ERR") {
          // v2.5.0 fail-open: probe request failed (blocked host / timeout /
          // stripped header). Keep the row untagged instead of deleting it.
          row.s.quality = row.s.quality || "";
          ranked.push({ s: row.s, i: row.i, q: row.s.quality || "ERR" });
          return;
        }
        if (!q) return; // probe succeeded, no resolution info -> removed
        if (q === "CAM") return; // cam / sd / sub-720 -> removed
        row.s.quality = q;
        ranked.push({ s: row.s, i: row.i, q: q });
      });
      // best first so dedupe keeps the strongest duplicate (stable)
      ranked.sort(function (a, b) {
        var r = rank(b.q) - rank(a.q);
        if (r !== 0) return r;
        return a.i - b.i;
      });
      var seenLocal = {}, out = [];
      ranked.forEach(function (row) {
        var s = row.s;
        var nu = normUrl(s.url);
        if (seenLocal[nu]) return;
        if (!claim(nu, now, PROVIDER)) return; // already reported by a different provider
        seenLocal[nu] = 1;
        out.push(s);
      });
      return out.slice(0, 40);
    }).catch(function () { return (list || []).slice(0, 40); });
  }

  var __orig = null;
  try { __orig = module.exports && module.exports.getStreams; } catch (e) { __orig = null; }
  if (typeof __orig === "function") {
    module.exports.getStreams = function () {
      var args = Array.prototype.slice.call(arguments), self = this;
      function finish(v) {
        if (settings().postFilter === false) return v;
        try { return postProcess(Array.isArray(v) ? v : []); }
        catch (e) { return Array.isArray(v) ? v : []; }
      }
      try {
        var r = __orig.apply(self, args);
        if (r && typeof r.then === "function") {
          return r.then(function (v) { return finish(v); }, function () { return []; });
        }
        return finish(r);
      } catch (e) { return Promise.resolve([]); }
    };
  }
})();

