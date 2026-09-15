/**
 * AsianHub Nuvio Plugin - Direct Streams Edition
 * Sources: KissAsian (kissasian.cam) + ViewAsian (viewasian.lol) + KissKH (kisskh.co)
 * Supports: Movies & TV Shows (Korean / Chinese / Japanese / Thai / Taiwan /
 *           Hong Kong / other Asian titles, English subs)
 * Language: ko / zh / ja / th / en
 * Author: xrexzerox
 * Version: 2.6.0
 *
 * v2.6.0 (2026-09-10) - asian-catalog v4.0.0 pairing:
 *   - NEW kisskh direct lane: asian:kh-<dramaId> rows (emitted for
 *     TMDB-unmatched KissKH catalog rows) resolve straight through the
 *     kisskh API by numeric drama id (detail -> episode -> kkey -> m3u8).
 *     Zero title searching, mirror rotation inherited from kisskhFetchJson.
 *   - parseAsianCatalogId now recognises the new kh- (owned here) and an-
 *     (owned by the animotvslash plugin) prefixes; an- rows are skipped
 *     fast like pmh- rows.
 *
 * v2.5.0 (2026-09-10) - app arg-shape hardening + kisskh lane self-sufficiency
 *   (same failure class as pinoyhub 5.6.0 "movies work / series don't"):
 *   - IMDb tt-id inputs (app without TMDB key) are resolved via the TMDB find
 *     API with the authoritative movie/tv type pinned from the hit.
 *   - Missing/null season+episode on a TV id no longer returns zero rows:
 *     defaults to S1E1 (app's own testScraper convention).
 *   - kisskh lane kkey is now generated LOCALLY first (AES-128 v2.8.10 port,
 *     byte-verified 16/16) -> site /keygen -> Google Script. The lane no
 *     longer dies when both external key services are unreachable.
 *
 * v2.3.0 (2026-09-10) — NuvioTVSmart webOS adaptation (Mixdrop/Dood TV-safe):
 *   - NEW: headerless-playability probe (ranged GET with zero custom headers).
 *     webOS/Tizen players can never send Referer/User-Agent, so Mixdrop
 *     direct mp4s (MDCore.wurl) and Dood token URLs used to be DEAD rows on
 *     TV even when extraction succeeded. When the CDN serves the bytes
 *     headerless (the token usually IS the authorization), the stream is
 *     now emitted HEADERLESS = plays on webOS, Tizen and ExoPlayer alike;
 *     when the CDN still 403s, the historical Referer-carrying row is kept
 *     (mobile unchanged). Probe fail-closes to the old behavior.
 *   - NEW: Mixdrop family extractor for kissasian's /v/3/ mxdrop server
 *     (packed eval -> MDCore.wurl -> direct mp4). Previously /v/3/ fell
 *     into the generic m3u8-leak family and always failed for mxdrop.
 *
 * v2.2.0 (2026-09-10) — direct-lane routing for source-scoped catalog ids
 *   (user report: "the reason why plugin not fetches because the url is
 *   different to the website"): asian-catalog 3.2.0 now emits TMDB-unmatched
 *   rows as SOURCE-SCOPED ids whose tail is the source site's OWN page slug:
 *       asian:ks-<kissasian-slug>   asian:va-<viewasian-slug>   asian:pmh-<...>
 *   For ks-/va- ids this plugin SKIPS title search and navigates the site's
 *   real page structure directly (paths verified live 2026-09-10):
 *       ks- -> /series/{slug}/ -> /{slug}-episode-{n}/
 *               player servers: /v/1/ justplay (default embed), /v/2/
 *               vidmoly (m3u8 leaks plain), /v/3/ mxdrop (packed)
 *               -> NEW: /v/2/ vidmoly fallback when the Byse chain fails
 *       va- -> /drama/{slug}/ -> /{show}-episode-{n}-...-sub/ ->
 *               kisskh.space/{show}-ep-{n}/ iframe -> vidmoly embed -> m3u8
 *   pmh- rows belong to the PinoyMoviesHub plugin -> skipped here fast (a
 *   wrong-site search could false-match an unrelated pinoy title).
 *   The legacy generic asian:<slug> search flow stays as fail-soft backup
 *   after the direct lane (and for stale CDN-cached rows).
 *
 * v2.1.0 (2026-09-09) — asian-catalog fallback-id alignment (user request:
 *   "ensure that every result in our catalog we have a stream link"):
 *   The asian-catalog addon emits two id shapes. `tmdb:<id>` metas already
 *   played fine, but TMDB-unmatched rows are emitted as `asian:<slug>`
 *   fallback metas (the site's own series/drama slug). On NuvioMobile those
 *   ids reach this plugin verbatim; previously the TMDB lookup on the raw
 *   string failed and getStreams returned [] — those rows had NO stream.
 *   Fix: parse the `asian:` prefix, de-slug the title ("queen-of-tears" ->
 *   "queen of tears") and run all three lanes with a pseudo-TMDB meta. The
 *   slug IS the source site's own slug, so the site search hits it exactly.
 *   Also: NuvioTVSmart's local-id plugin path passes mediaType "series"
 *   verbatim (not "tv") — normalize it here ("series"/"show" -> "tv") so
 *   the legacy-signature arg-shift cannot corrupt season/episode.
 *
 * v2.0.0 (2026-09-09) — source swap (user request):
 *   REMOVED: MyAsianTV (myasiantv.com.lv) and Dramacool (dramacool.uno) lanes.
 *   ADDED (all three verified live end-to-end on 2026-09-09):
 *
 *   KissAsian (WordPress "dramastream" theme):
 *     1. search   GET /?s={title}
 *                 -> <article class="bs"> rows with /series/{slug}/ links
 *     2. series   GET /series/{slug}/
 *                 -> /{slug}-episode-{n}/ links
 *     3. episode  GET /{slug}-episode-{n}/
 *                 -> <iframe src="https://justplay.cam/e/{code}">
 *     4. justplay.cam is a Byse player (React SPA) with a captcha-gated API:
 *          a. POST /api/videos/{code}/embed/captcha
 *             (headers X-Embed-Origin/Referer/Parent = kissasian.cam)
 *             -> { pow_nonce, pow_difficulty(16), pow_token,
 *                  algorithm: "sha256-leading-zero-bits" }
 *             (the label lies: the hash is a custom xxHash-style mixer,
 *              ported below as byseHashDigest - real sha256 fails verify)
 *          b. solve: find counter N so digest(pow_nonce + ":" + N) has
 *             >= difficulty leading zero bits. N is the solution string.
 *             (difficulty 16 ~= 65k iterations, ~1-2s in pure JS)
 *          c. POST /api/videos/{code}/embed/captcha/verify
 *             { pow_token, solution } -> { status:"ok", token }
 *          d. POST /api/videos/{code}/embed/playback
 *             header X-Captcha-Token: {token}
 *             -> { playback: { algorithm:"AES-256-GCM", iv, payload,
 *                              key_parts[30], version, expires_at } }
 *          e. key = key_parts[version-1] ++ key_parts[30-version] (b64url)
 *             plain = AES-256-CTR(key, iv||0x00000002, payload[-16:])  (tag
 *             skipped - same proven decryptor as pinoyhub.js Byse)
 *             -> { sources: [{ url, label, height, mime_type }] } with
 *             signed self-authorizing HLS URLs (play headerless).
 *
 *   ViewAsian (WordPress "viewasian" theme):
 *     1. search   GET /?s={title}
 *                 -> <a href="/drama/{slug}/" class="img" title="Show (2024)">
 *     2. drama    GET /drama/{slug}/
 *                 -> episode list ul.list-episode-item-2.all-episode with
 *                    /{show}-ep-{n}-eng-sub-drama/ links (server variants
 *                    carry an extra -1/-2 segment before -eng-sub)
 *     3. episode  GET /{show}-ep-{n}-eng-sub-drama/
 *                 -> <iframe src="https://kisskh.space/{show}-ep-{n}/">
 *     4. player   GET kisskh.space/{show}-ep-{n}/
 *                 -> iframe on a vidmoly embed host /embed-{id}.html
 *     5. embed    GET vidmoly embed (Referer kisskh.space)
 *                 -> plaintext m3u8 URL in the page (jwplayer + eval packer
 *                    still leaks the playlist URL as a plain string)
 *
 *   KissKH (kisskh.co JSON API; kisskh.ovh fallback - same site, either
 *   domain may be Cloudflare-challenged depending on network):
 *     1. search   GET /api/DramaList/Search?q={title}&type=0
 *     2. detail   GET /api/DramaList/Drama/{id}?isq=false -> episodes[]
 *     3. key      GET <google apps script>?id={epsId}&version=2.8.10
 *     4. sources  GET /api/DramaList/Episode/{epsId}.png?err=false&ts=&
 *                 time=&kkey={key} -> { Video, Video_tmp, ThirdParty }
 *     (device-side lane: kisskh.co challenges datacenter IPs, but Nuvio
 *      clients on residential connections are served normally - same
 *      behaviour the standalone kisskh.js provider has always had)
 *
 * SANDBOX SAFETY (NuvioTVSmart worker + NuvioMobile QuickJS):
 *   - No require() of anything; global fetch only
 *   - Pure ES5 promise chains, no async/await
 *   - No Buffer / TextDecoder / URL / padStart / Object.entries / Array.prototype.flat
 *   - Pure-regex HTML parsing (no cheerio)
 *   - Pure-JS crypto (base64url, AES-256, custom hash) - no WebCrypto dependency
 *   - Every lane fully fail-soft; a dead source never blocks the others
 */

var PROVIDER_NAME = "AsianHub";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var KISSASIAN_BASE = "https://kissasian.cam";
var JUSTPLAY_BASE = "https://justplay.cam";
var VIEWASIAN_BASE = "https://viewasian.lol";
var KISSKH_BASES = ["https://kisskh.nl", "https://kisskh.co", "https://kisskh.ovh"];
var KISSKH_KEY_API = "https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

var PAGE_TIMEOUT_MS = 12000;
var EMBED_TIMEOUT_MS = 10000;
var GLOBAL_DEADLINE_MS = 22000; // Byse chain is 6 sequential hops + PoW
var POW_MAX_MS = 8000;

// ===== SMALL UTILITIES =====

function merge(obj1, obj2) {
  var out = {};
  var k;
  for (k in obj1 || {}) out[k] = obj1[k];
  for (k in obj2 || {}) out[k] = obj2[k];
  return out;
}

function hasTimers() {
  return typeof setTimeout === "function";
}

function fetchWithTimeout(url, options, ms) {
  options = options || {};
  if (!hasTimers()) return fetch(url, options);
  var timer = null;
  var killer = new Promise(function(resolve, reject) {
    timer = setTimeout(function() {
      reject(new Error("fetch timeout"));
    }, ms || PAGE_TIMEOUT_MS);
  });
  return Promise.race([fetch(url, options), killer]).then(
    function(res) { clearTimeout(timer); return res; },
    function(err) { clearTimeout(timer); throw err; }
  );
}

/**
 * Races a body-read promise against the same deadline as the request.
 * Some free CDNs return headers instantly but stream the body at ~1KB/s
 * (throttled playlists); without this guard a single playlist could stall
 * extraction for 25s+ even though fetchWithTimeout resolved on time.
 */
function raceBody(promise, ms) {
  if (!hasTimers()) return promise;
  var timer = null;
  var killer = new Promise(function(resolve, reject) {
    timer = setTimeout(function() {
      reject(new Error("body read timeout"));
    }, ms || PAGE_TIMEOUT_MS);
  });
  return Promise.race([promise, killer]).then(
    function(res) { clearTimeout(timer); return res; },
    function(err) { clearTimeout(timer); throw err; }
  );
}

function fetchText(url, options) {
  options = options || {};
  var deadline = options.timeoutMs || PAGE_TIMEOUT_MS;
  return fetchWithTimeout(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: merge(HEADERS, options.headers || {}),
    body: options.body
  }, deadline).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return raceBody(res.text(), deadline);
  });
}

function fetchJson(url, options) {
  options = options || {};
  var deadline = options.timeoutMs || PAGE_TIMEOUT_MS;
  return fetchWithTimeout(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: merge(HEADERS, options.headers || {}),
    body: options.body
  }, deadline).then(function(res) {
    if (!res.ok) return null;
    return raceBody(res.json(), deadline);
  }).catch(function() { return null; });
}

/** POST JSON, resolve { status, data } - never rejects (fail-soft callers). */
function postJson(url, bodyObj, headers, timeoutMs) {
  return fetchWithTimeout(url, {
    method: "POST",
    redirect: "follow",
    headers: merge(merge(HEADERS, { "Content-Type": "application/json", "Accept": "application/json" }), headers || {}),
    body: JSON.stringify(bodyObj || {})
  }, timeoutMs || EMBED_TIMEOUT_MS).then(function(res) {
    return raceBody(res.text(), timeoutMs || EMBED_TIMEOUT_MS).then(function(text) {
      var data = null;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      return { status: res.status, data: data };
    });
  }).catch(function() { return { status: 0, data: null }; });
}

function hostOf(url) {
  var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
  return m ? m[1].replace(/^www\./i, "") : "";
}

/**
 * v2.3.0 webOS adaptation: can this direct URL be fetched with NO custom
 * headers at all? webOS/Tizen players cannot send Referer/User-Agent, so a
 * stream is only TV-safe when the CDN serves it headerless. One ranged GET
 * (0-1023 bytes): 2xx/206 with a non-HTML content-type means the token IS
 * the authorization -> emit the stream WITHOUT headers. Any 40x, challenge
 * page or probe error fail-closes to the historical headers-carrying row.
 * No Referer is sent: the whole point is to test the player's condition.
 */
function probeHeaderless(url) {
  return fetchWithTimeout(url, {
    method: "GET",
    redirect: "follow",
    headers: { "Range": "bytes=0-1023" }
  }, 9000).then(function(res) {
    if (!res || res.status < 200 || res.status >= 300) return false;
    var ct = "";
    try {
      if (res.headers && typeof res.headers.get === "function") {
        ct = String(res.headers.get("content-type") || "");
      } else if (res.headers && typeof res.headers === "object") {
        var keys = Object.keys(res.headers), k;
        for (k = 0; k < keys.length; k++) {
          if (String(keys[k]).toLowerCase() === "content-type") {
            ct = String(res.headers[keys[k]] || "");
            break;
          }
        }
      }
    } catch (e) { ct = ""; }
    if (/text\/html/i.test(ct)) return false; // challenge/soft-404 page
    return true;
  }).catch(function() { return false; });
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Crash Landing on You (2019) Episode 16" -> "crash landing on you" */
function normalizeTitle(s) {
  var t = String(s || "").toLowerCase();
  t = t.replace(/\((?:19|20)\d{2}\)/g, " ");
  t = t.replace(/[-:\u2013\u2014|]?\s*episode\s*\d+\s*$/i, " ");
  t = t.replace(/[-:\u2013\u2014|]?\s*ep\s*\d+\s*$/i, " ");
  t = t.replace(/\b(19|20)\d{2}\b/g, " ");
  t = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

/** token-overlap score (0..3) between two already-normalized titles */
function titleScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.length >= 6 && b.indexOf(a) === 0) return 2.5;
  if (b.length >= 6 && a.indexOf(b) === 0) return 2.5;
  if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 2;
  var at = a.split(" ");
  var bt = b.split(" ");
  var set = {};
  var i;
  for (i = 0; i < bt.length; i++) set[bt[i]] = true;
  var inter = 0;
  for (i = 0; i < at.length; i++) if (set[at[i]]) inter++;
  var cov = inter / Math.max(at.length, bt.length);
  return cov >= 0.6 ? 1.5 : 0;
}

/**
 * asian-catalog addon fallback ids (parse BEFORE the generic de-slug):
 *   v3.2.0 source-scoped shapes — asian:ks-<slug>, asian:va-<slug>,
 *   asian:pmh-<slug>. v4.0.0 adds asian:kh-<kisskh dramaId> (owned by this
 *   plugin's kisskh lane) and asian:an-<animotvslash slug> (owned by the
 *   animotvslash plugin -> skipped here). The tail slug is the source
 *   site's own page slug, so the plugin can navigate the real site
 *   structure directly instead of searching a title that may not match the
 *   site's URL. Returns:
 *     { source: "ks"|"va"|"pmh", slug, title }  for scoped rows
 *     { source: "", slug, title }               for legacy generic rows
 *   null when the id is not an asian-catalog id.
 */
function parseAsianCatalogId(rawId) {
  var s = String(rawId || "").trim();
  var m = s.match(/^asian[:\/](.+)$/i);
  if (!m) return null;
  var tail = m[1].replace(/\.json$/i, "").split("/")[0].trim().toLowerCase();
  if (!tail || !/^[a-z0-9][a-z0-9-]*$/i.test(tail)) return null;
  var pm = tail.match(/^(ks|va|pmh|kh|an)-([a-z0-9][a-z0-9-]*)$/);
  if (pm) {
    // a source-scoped row; a bare prefix with no slug is invalid
    if (!pm[2] || pm[2] === "") return null;
    var stitle = pm[2].replace(/-+/g, " ").replace(/\s+/g, " ").trim();
    if (!stitle) return null;
    return { source: pm[1], slug: pm[2], title: stitle };
  }
  var title = tail.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return null;
  return { source: "", slug: tail, title: title };
}

function parseQualityFromPlaylist(playlistText) {
  if (!playlistText) return "";
  var best = 0;
  var re = /RESOLUTION=(\d+)x(\d+)/g;
  var m;
  while ((m = re.exec(playlistText)) !== null) {
    var h = parseInt(m[1], 10);
    if (h > best) best = h;
  }
  if (best >= 3800) return "2160p";
  if (best >= 1900) return "1080p";
  if (best >= 1250) return "720p";
  if (best >= 800) return "480p";
  return "";
}

// ===== TMDB =====

function tmdbLookup(type, tmdbId) {
  var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetchJson(url).then(function(data) {
    if (!data || data.success === false) return null;
    var title = data.title || data.name || "";
    var original = data.original_title || data.original_name || title;
    var year = (data.release_date || data.first_air_date || "").split("-")[0];
    return { type: type, title: title, original: original, year: year, raw: data };
  });
}

function getTmdbInfoAuto(tmdbId) {
  return tmdbLookup("movie", tmdbId).then(function(movie) {
    if (movie) return movie;
    return tmdbLookup("tv", tmdbId).then(function(tv) {
      return tv || { type: "", title: "", original: "", year: "", raw: null };
    });
  });
}

function getTmdbEpisodeTitle(tmdbId, season, episode) {
  if (!season || !episode) return Promise.resolve("");
  var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "/episode/" + episode + "?api_key=" + TMDB_API_KEY;
  return fetchJson(url).then(function(data) {
    return (data && data.name) || "";
  }).catch(function() { return ""; });
}

// v2.5.0: the app passes an IMDb tt-id when no TMDB key is configured
// (PluginRepository.ensureTmdbId falls back to the raw id). Resolve it to a
// TMDB id via the find API (same fix as pinoyhub 5.6.0 / kisskh 4.3.0).
function resolveImdbToTmdb(imdbId) {
  var url = "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdbId) +
    "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
  return fetchJson(url, { timeoutMs: 15000 }).then(function(data) {
    if (!data || typeof data !== "object") return null;
    var tv = (data.tv_results || [])[0];
    var mv = (data.movie_results || [])[0];
    if (tv && tv.id) {
      return { tmdbId: String(tv.id), type: "tv", title: tv.name || tv.original_name || "" };
    }
    if (mv && mv.id) {
      return { tmdbId: String(mv.id), type: "movie", title: mv.title || mv.original_title || "" };
    }
    return null;
  }).catch(function() { return null; });
}

// ===== GLOBAL EXTRACTION DEADLINE =====

/**
 * Runs lane thunks in parallel. When the deadline fires, ALREADY-COMPLETED
 * lane results are returned (in-flight lanes become null) instead of
 * discarding everything: a fast source must never be dropped because a
 * second source is stalled on a throttled CDN.
 */
function withExtractionDeadline(promises, ms) {
  var results = new Array(promises.length);
  var trackers = promises.map(function(p, idx) {
    return Promise.resolve().then(p).then(function(r) {
      results[idx] = (r === undefined) ? null : r;
    }, function() {
      results[idx] = null;
    });
  });
  var allDone = Promise.all(trackers).then(function() { return results; });
  if (!hasTimers()) return allDone;
  var timer = null;
  var partial = new Promise(function(resolve) {
    timer = setTimeout(function() { resolve(results.slice()); }, ms || GLOBAL_DEADLINE_MS);
  });
  return Promise.race([allDone, partial]).then(function(result) {
    clearTimeout(timer);
    return result;
  }, function() {
    clearTimeout(timer);
    return [];
  });
}

// ===== STREAM BUILDER =====

function buildStream(displayTitle, meta, resolved) {
  // resolved: { url, quality, source, host, headers? }
  var q = resolved.quality || "HLS";
  var line1 = meta.isSeries
    ? "S" + meta.season + "E" + meta.episode + (meta.episodeTitle ? " - " + meta.episodeTitle : "") + " | " + displayTitle
    : displayTitle;
  var line2 = (resolved.headers ? "Signed HLS" : "Direct HLS") + " | " + q + " | " + (resolved.host || "");
  var line3 = resolved.source;

  var stream = {
    name: PROVIDER_NAME + " | " + resolved.source + " | " + q,
    title: line1 + "\n" + line2 + "\n" + line3,
    url: resolved.url,
    quality: q,
    behaviorHints: {
      bingeGroup: "asianhub-hls"
    }
  };
  if (resolved.headers) stream.headers = resolved.headers;
  return stream;
}

/**
 * Fetches an HLS playlist and, when it is a master playlist, picks the
 * highest-bandwidth variant. Media playlists pass through unchanged.
 * Returns { url, quality } or null.
 */
function resolveHls(url, referer, sourceLabel) {
  var headers = referer ? { "Referer": referer } : {};
  // 5s verify budget: a healthy playlist arrives in <2s. A throttled CDN
  // times out -> the URL is still returned unverified below, because it IS
  // the player's real stream URL and devices typically fetch it fine.
  return fetchText(url, { headers: headers, timeoutMs: 5000 }).then(function(text) {
    if (!text || text.indexOf("#EXTM3U") !== 0) {
      if (/\.mp4(\?|$)/i.test(url)) return { url: url, quality: "" };
      return null;
    }
    if (text.indexOf("#EXT-X-STREAM-INF") !== -1) {
      var lines = text.split("\n");
      var best = null, bestH = 0, i;
      for (i = 0; i < lines.length - 1; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") === 0) {
          var rm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
          var bm = lines[i].match(/BANDWIDTH=(\d+)/);
          var h = rm ? parseInt(rm[1], 10) : (bm ? parseInt(bm[1], 10) / 1000 : 0);
          var next = String(lines[i + 1] || "").trim();
          if (next && next.charAt(0) !== "#" && h > bestH) {
            bestH = h;
            best = next;
          }
        }
      }
      if (best) {
        var abs = best.indexOf("http") === 0 ? best : url.replace(/[^\/]*$/, "") + best;
        var q = parseQualityFromPlaylist(text);
        return { url: abs, quality: q };
      }
      return null;
    }
    return { url: url, quality: parseQualityFromPlaylist(text) };
  }).catch(function(err) {
    var msg = String((err && err.message) || err);
    if (msg.indexOf("body read timeout") !== -1 || msg.indexOf("fetch timeout") !== -1) {
      return { url: url, quality: "" };
    }
    return null;
  });
}

// ===== CRYPTO (ported from providers/pinoyhub.js - proven on-device) =====

function b64urlToBytes(str) {
  var ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var t = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  var out = [];
  var acc = 0, bits = 0, i, v;
  for (i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    if (ch === "=") break;
    v = ALPHA.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}

function bytesToUtf8(bytes) {
  var out = "", i = 0, c, cp;
  while (i < bytes.length) {
    c = bytes[i];
    if (c < 0x80) { out += String.fromCharCode(c); i += 1; }
    else if (c < 0xe0) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (c < 0xf0) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      cp = ((c & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    }
  }
  return out;
}

// AES S-box built at load time (avoids a 256-entry literal table).
var AES_SBOX = (function () {
  var box = new Array(256);
  var p = 1, q = 1, t;
  do {
    p = p ^ ((p << 1) ^ (p & 0x80 ? 0x11b : 0));
    p &= 0xff;
    q = (q ^ (q << 1)) & 0xff;
    q = (q ^ (q << 2)) & 0xff;
    q = (q ^ (q << 4)) & 0xff;
    if (q & 0x80) q ^= 0x09;
    t = q ^ ((q << 1) | (q >>> 7)) ^ ((q << 2) | (q >>> 6)) ^ ((q << 3) | (q >>> 5)) ^ ((q << 4) | (q >>> 4));
    box[p] = (t ^ 0x63) & 0xff;
  } while (p !== 1);
  box[0] = 0x63;
  return box;
})();

function aes256ExpandKey(keyBytes) {
  var rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40];
  var w = [];
  var i, t;
  for (i = 0; i < 8; i++) {
    w.push([keyBytes[4 * i], keyBytes[4 * i + 1], keyBytes[4 * i + 2], keyBytes[4 * i + 3]]);
  }
  for (i = 8; i < 60; i++) {
    t = w[i - 1].slice(0);
    if (i % 8 === 0) {
      t = [AES_SBOX[t[1]] ^ rcon[i / 8 - 1], AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
    } else if (i % 8 === 4) {
      t = [AES_SBOX[t[0]], AES_SBOX[t[1]], AES_SBOX[t[2]], AES_SBOX[t[3]]];
    }
    w.push([w[i - 8][0] ^ t[0], w[i - 8][1] ^ t[1], w[i - 8][2] ^ t[2], w[i - 8][3] ^ t[3]]);
  }
  return w;
}

function aesXtime(x) {
  return ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
}

function aes256EncryptBlock(w, input) {
  var s = new Array(16);
  var out = new Array(16);
  var i, c, r, round, a0, a1, a2, a3, t0, t1, t2, t3, src;
  for (i = 0; i < 16; i++) s[i] = input[i] ^ w[Math.floor(i / 4)][i % 4];
  for (round = 1; round < 14; round++) {
    src = s.slice(0);
    for (c = 0; c < 4; c++) {
      a0 = AES_SBOX[src[((c + 0) % 4) * 4 + 0]];
      a1 = AES_SBOX[src[((c + 1) % 4) * 4 + 1]];
      a2 = AES_SBOX[src[((c + 2) % 4) * 4 + 2]];
      a3 = AES_SBOX[src[((c + 3) % 4) * 4 + 3]];
      t0 = aesXtime(a0); t1 = aesXtime(a1); t2 = aesXtime(a2); t3 = aesXtime(a3);
      s[c * 4 + 0] = (t0 ^ a1 ^ t1 ^ a2 ^ a3) & 0xff;
      s[c * 4 + 1] = (a0 ^ t1 ^ a2 ^ t2 ^ a3) & 0xff;
      s[c * 4 + 2] = (a0 ^ a1 ^ t2 ^ a3 ^ t3) & 0xff;
      s[c * 4 + 3] = (a0 ^ t0 ^ a1 ^ a2 ^ t3) & 0xff;
    }
    for (i = 0; i < 16; i++) s[i] ^= w[4 * round + Math.floor(i / 4)][i % 4];
  }
  for (c = 0; c < 4; c++) {
    for (r = 0; r < 4; r++) {
      out[c * 4 + r] = AES_SBOX[s[((c + r) % 4) * 4 + r]] ^ w[56 + c][r];
    }
  }
  return out;
}

/**
 * GCM-mode plaintext recovery (CTR phase only). The trailing 16 bytes of the
 * wire payload are the auth tag and are skipped (not decrypted, not
 * verified): a wrong key/IV yields garbage that fails JSON.parse. Counter
 * starts at inc32(J0) per the GCM spec, with J0 = IV(12) || 0x00000001
 * shifted once (0x00000002) - matches the Byse frontend.
 */
function aesGcmDecryptNoTag(keyBytes, ivBytes, dataBytes) {
  var w = aes256ExpandKey(keyBytes);
  var cb = [];
  var i, j, ks, off = 0, n = dataBytes.length - 16; /* last 16 bytes = tag */
  for (i = 0; i < 12; i++) cb.push(ivBytes[i] & 0xff);
  cb.push(0, 0, 0, 2);
  var out = [];
  while (off < n) {
    ks = aes256EncryptBlock(w, cb);
    for (j = 0; j < 16 && off < n; j++, off++) {
      out.push(dataBytes[off] ^ ks[j]);
    }
    for (j = 3; j >= 0; j--) {
      cb[12 + j] = (cb[12 + j] + 1) & 0xff;
      if (cb[12 + j]) break;
    }
  }
  return out;
}

/**
 * Byse ships the AES key split into key_parts; the playback version picks
 * two 1-based indices [version, 31 - version] whose base64url payloads
 * concatenate to the 32-byte key.
 */
function byseKeyFromParts(playback) {
  var parts = playback.key_parts;
  if (!parts || !parts.length) return null;
  var version = parseInt(playback.version, 10);
  var picked = [];
  var i, b;
  if (version >= 1 && version <= 20) {
    var i1 = version - 1;
    var i2 = 30 - version;
    if (parts[i1]) picked.push(parts[i1]);
    if (parts[i2] && i2 !== i1) picked.push(parts[i2]);
    if (!picked.length) return null;
  } else {
    picked = parts;
  }
  var bytes = [];
  for (i = 0; i < picked.length; i++) {
    if (typeof picked[i] !== "string" || !picked[i].length) continue;
    b = b64urlToBytes(picked[i]);
    bytes = bytes.concat(b);
  }
  return bytes;
}

// ===== BYSE PROOF-OF-WORK (custom hash, ported from the justplay bundle) =====
// The API labels it "sha256-leading-zero-bits" but the bundle implements a
// custom xxHash-style 32-bit mixer. Real sha256 does NOT verify.

function byseRotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

function byseMix(s) {
  s[0] = (s[0] + s[1]) >>> 0; s[3] = byseRotl(s[3] ^ s[0], 16);
  s[2] = (s[2] + s[3]) >>> 0; s[1] = byseRotl(s[1] ^ s[2], 12);
  s[0] = (s[0] + s[1]) >>> 0; s[3] = byseRotl(s[3] ^ s[0], 8);
  s[2] = (s[2] + s[3]) >>> 0; s[1] = byseRotl(s[1] ^ s[2], 7);
}

/** latin1 bytes of str (matches the site's charCodeAt & 255) */
function byseBytes(str) {
  var out = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
  return out;
}

function byseHashDigest(bytes) {
  var s = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
  var i, f, a, rd, k, w, t, d, v;
  for (i = 0; i < bytes.length; i++) {
    s[0] = (s[0] + bytes[i]) >>> 0;
    s[0] = byseRotl(s[0], 7);
    byseMix(s);
  }
  for (f = 0; f < 8; f++) byseMix(s);
  var r = new Uint32Array(512);
  for (a = 0; a < 512; a++) { byseMix(s); r[a] = (s[0] ^ s[2]) >>> 0; }
  for (rd = 0; rd < 2; rd++) {
    for (k = 0; k < 512; k++) {
      var idx = r[k] & 511;
      var c = (r[k] + r[idx]) >>> 0;
      c = byseRotl(c, 13);
      c = (c ^ Math.imul(r[(k + 1) & 511], 2654435761)) >>> 0;
      r[k] = c;
      s[0] = (s[0] ^ c) >>> 0;
      byseMix(s);
    }
  }
  var n = new Uint32Array(8);
  for (w = 0; w < 8; w++) {
    byseMix(s);
    v = s[0];
    var base = w * 64;
    for (t = 0; t < 64; t++) {
      d = r[base + t];
      v = (v + d) >>> 0;
      v = byseRotl(v, 5);
      v = (v ^ Math.imul(d, 2246822519)) >>> 0;
    }
    n[w] = (v ^ s[2]) >>> 0;
  }
  return n;
}

function byseLeadingZeroBits(words) {
  var bits = 0;
  for (var i = 0; i < words.length; i++) {
    if (words[i] === 0) { bits += 32; continue; }
    return bits + Math.clz32(words[i]);
  }
  return bits;
}

/**
 * Finds the counter N (returned as a DECIMAL STRING) such that
 * digest(pow_nonce + ":" + N) has >= difficulty leading zero bits.
 * Difficulty 16 -> ~65k iterations (~1-2s in pure JS). Returns null on
 * timeout (the lane fails soft).
 */
function byseSolvePow(nonceStr, difficulty, maxMs) {
  if (difficulty <= 0) return "0";
  var prefix = String(nonceStr) + ":";
  var counter = 0;
  var t0 = Date.now();
  var budget = maxMs || POW_MAX_MS;
  for (;;) {
    var d = byseHashDigest(byseBytes(prefix + counter));
    if (byseLeadingZeroBits(d) >= difficulty) return String(counter);
    counter++;
    // time check every 8192 hashes (Date.now() is not free), plus a hard
    // iteration cap so a runaway loop can never wedge a device runtime
    if ((counter & 8191) === 0 && Date.now() - t0 > budget) return null;
    if (counter > 4000000) return null;
  }
}

// ===== SOURCE 1: KissAsian (kissasian.cam -> justplay.cam Byse) =====

// --- v2.2.0 Dood-family extractor (ported from pinoyhub.js, proven on-device).
// kissasian's /v/2/ and /v/3/ servers vary PER SHOW (verified live:
// justplay default, vidmoly, dooood.com, likessb.com, drive.google.com
// placeholder) — extract each family accordingly.

function doodFamilyHost(host) {
  var h = String(host || "").toLowerCase();
  if (h.indexOf("dood") !== -1 || h.indexOf("dooo") !== -1 || h.indexOf("dsvplay") !== -1) return true;
  var known = ["playmogo.com", "myvidplay.com", "dsvplay.com", "d000d.com", "dooood.com", "ds2play.com", "ds2play2.com", "doodcdn.io"];
  for (var i = 0; i < known.length; i++) {
    if (h.indexOf(known[i]) !== -1) return true;
  }
  return false;
}

function doodFindMd5Path(html) {
  var m = html.match(/["']\/(pass_md5\/[a-z0-9]+(?:\/[a-z0-9]+)?)['"]/i);
  if (m) return m[1];
  var unpacked = unpackPacker(html);
  if (unpacked) {
    m = unpacked.match(/["']\/(pass_md5\/[a-z0-9]+(?:\/[a-z0-9]+)?)['"]/i);
    if (m) return m[1];
  }
  m = html.match(/\/pass_md5\/([a-z0-9]+)/i);
  return m ? "pass_md5/" + m[1] : null;
}

function doodIsGated(html) {
  return /op=validate|turnstile\.render|challenges\.cloudflare\.com\/turnstile/i.test(html);
}

function doodIsDead(html) {
  return /video you are looking for is not found|class="not_found"/i.test(html);
}

function doodFetchDirect(host, md5Path, refererUrl, qualityHint) {
  var passUrl = "https://" + host + "/" + md5Path;
  return fetchText(passUrl, {
    headers: { "Referer": refererUrl, "X-Requested-With": "XMLHttpRequest" }
  }).then(function(body) {
    var base = String(body).trim();
    if (base.indexOf("http") !== 0) return null;
    var token = md5Path.split("/")[1] || "";
    var expiry = Date.now() + 2 * 60 * 60 * 1000;
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var pad = "", ci;
    for (ci = 0; ci < 10; ci++) pad += chars.charAt(Math.floor(Math.random() * chars.length));
    var directUrl = base + pad + "?token=" + token + "&expiry=" + expiry;
    // v2.3.0 webOS adaptation: the token IS the authorization on most Dood
    // nodes -> headerless rows play on webOS/Tizen too. Fail-closed to the
    // Referer-carrying row when the CDN still demands it (mobile unchanged).
    return probeHeaderless(directUrl).then(function(headerlessOk) {
      return {
        url: directUrl,
        quality: parseQualityLabel(qualityHint),
        headers: headerlessOk ? null : { "Referer": "https://" + host + "/", "User-Agent": HEADERS["User-Agent"] },
        headerless: headerlessOk
      };
    });
  }).catch(function() { return null; });
}

function extractDoodDirect(embedUrl, refererUrl) {
  var embedIdMatch = embedUrl.match(/\/e\/([a-z0-9]+)/i);
  if (!embedIdMatch) return Promise.resolve(null);
  var embedId = embedIdMatch[1];
  var qualityHint = "";
  return fetchWithTimeout(embedUrl, {
    method: "GET", redirect: "follow",
    headers: merge(HEADERS, { "Referer": refererUrl || "" })
  }, EMBED_TIMEOUT_MS).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    var finalUrl = (res && res.url) ? String(res.url) : embedUrl;
    return raceBody(res.text(), EMBED_TIMEOUT_MS).then(function(html) {
      var host = hostOf(finalUrl) || hostOf(embedUrl);
      if (doodIsGated(html)) return null;
      if (doodIsDead(html)) return null;
      var tm = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (tm) qualityHint = tm[1];
      var md5Path = doodFindMd5Path(html);
      if (!md5Path) return null;
      return doodFetchDirect(host, md5Path, "https://" + host + "/e/" + embedId, qualityHint);
    });
  }).catch(function() { return null; });
}

// --- v2.3.0 Mixdrop-family extractor (kissasian /v/3/ mxdrop server) ---
// mxdrop embeds pack the player config in eval(function(p,a,c,k,e,d){...});
// the unpacked config carries MDCore.wurl = the direct mp4 URL. The generic
// m3u8-leak family never matched these, so /v/3/ always failed before.

function isMixdropFamily(host) {
  return /mixdrop|mixdrp|mxdrop|miixdrop|mixdroop/.test(String(host || "").toLowerCase());
}

function extractMixdropDirect(embedUrl, refererUrl) {
  if (!embedUrl) return Promise.resolve(null);
  if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
  return fetchWithTimeout(embedUrl, {
    method: "GET", redirect: "follow",
    headers: merge(HEADERS, { "Referer": refererUrl || KISSASIAN_BASE + "/" })
  }, EMBED_TIMEOUT_MS).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return raceBody(res.text(), EMBED_TIMEOUT_MS).then(function(html) {
      var unpacked = unpackPacker(html);
      var wurl = "";
      var m = unpacked.match(/MDCore\.wurl\s*=\s*["']([^"']*)["']/);
      if (m) wurl = m[1];
      if (!wurl) {
        m = html.match(/MDCore\.wurl\s*=\s*["']([^"']*)["']/);
        if (m) wurl = m[1];
      }
      if (!wurl || wurl === " " || wurl.length < 6) return null;
      if (wurl.indexOf("//") === 0) wurl = "https:" + wurl;
      else if (wurl.indexOf("http") !== 0) wurl = "https://" + wurl.replace(/^\/+/, "");
      var host = hostOf(res.url) || hostOf(embedUrl);
      var referered = { "Referer": "https://" + host + "/", "User-Agent": HEADERS["User-Agent"] };
      // v2.3.0: headerless when the CDN allows it (webOS-safe), else Referer.
      return probeHeaderless(wurl).then(function(headerlessOk) {
        return {
          url: wurl,
          quality: parseQualityLabel("") || "Direct",
          headers: headerlessOk ? null : referered,
          headerless: headerlessOk
        };
      });
    });
  }).catch(function() { return null; });
}

function parseQualityLabel(text) {
  var value = String(text || "").toLowerCase();
  var m = value.match(/\b(2160p|1440p|1080p|720p|480p|360p|4k|uhd|hd|sd|cam)\b/);
  if (!m) return "";
  var q = m[1];
  if (q === "4k" || q === "uhd") return "2160p";
  if (q === "hd") return "720p";
  if (q === "sd") return "480p";
  if (q === "cam") return "CAM";
  return q;
}

// --- v2.2.0 Dean Edwards packer unpacker (for Dood clone packed players) ---

function jsUnescape(s) {
  return String(s).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-3][0-7]{0,2}|[\\nrtbfv'"])/g, function(all, esc) {
    if (esc.charAt(0) === "u" || esc.charAt(0) === "x") {
      return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
    switch (esc) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0": return "\0";
      case "\\": return "\\";
      default: return esc;
    }
  });
}

function unpackPacker(packed) {
  var m = String(packed).match(/\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*\d+\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)/);
  if (!m) return "";
  var payload = jsUnescape(m[1]);
  var keys = jsUnescape(m[3]).split("|");
  var dict = {};
  var i;
  for (i = 0; i < keys.length; i++) dict[String(i)] = keys[i];
  return payload.replace(/\b\w+\b/g, function(w) {
    return (dict[w] !== undefined && dict[w] !== "") ? dict[w] : w;
  });
}

/**
 * Search returns <article class="bs"> rows. Series rows carry
 * /series/{slug}/ links with a clean title="Show" attribute (no year).
 * Episode rows (/{slug}-episode-{n}/) are ignored here.
 * Returns the series page URL of the best title match ("" when none).
 */
function kissasianSearchSeriesUrl(tmdb) {
  // Try the TMDB title first, then the ORIGINAL title — the site indexes
  // many shows under their native-language title, so the second attempt
  // materially raises the match rate for tmdb: catalog rows.
  var attempts = [];
  if (tmdb.title) attempts.push(tmdb.title);
  if (tmdb.original && attempts.indexOf(tmdb.original) === -1) attempts.push(tmdb.original);
  if (!attempts.length) return Promise.resolve("");
  var normTitle = normalizeTitle(tmdb.title);
  var normOrig = normalizeTitle(tmdb.original);
  function runSearch(query) {
    var url = KISSASIAN_BASE + "/?s=" + encodeURIComponent(query);
    return fetchText(url, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
      var best = "", bestScore = 0;
      var re = /<article class="bs"[^>]*>([\s\S]*?)<\/article>/g;
      var m;
      while ((m = re.exec(html)) !== null) {
        var body = m[1];
        var lm = body.match(/href="https?:\/\/kissasian\.cam\/series\/([a-z0-9-]+)\//i);
        if (!lm) continue;
        var tm = body.match(/title="([^"]+)"/i);
        if (!tm) continue;
        var tNorm = normalizeTitle(tm[1]);
        var score = Math.max(titleScore(normTitle, tNorm), titleScore(normOrig, tNorm));
        if (score > bestScore) {
          bestScore = score;
          best = KISSASIAN_BASE + "/series/" + lm[1] + "/";
        }
      }
      return bestScore >= 1.5 ? best : "";
    }).catch(function() { return ""; });
  }
  return runSearch(attempts[0]).then(function(best) {
    if (best || attempts.length < 2) return best;
    return runSearch(attempts[1]);
  });
}

/**
 * Series page -> episode links /{slug}-episode-{n}/. STRICT: the episode
 * slug must start with the series' own slug (avoids the "recently added"
 * widget matching unrelated shows). Exact-episode or bust for TV (a wrong
 * episode is worse than none).
 */
function kissasianFindEpisodeUrl(seriesUrl, wantEp) {
  if (!seriesUrl) return Promise.resolve("");
  return fetchText(seriesUrl, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
    var slugm = seriesUrl.match(/\/series\/([a-z0-9-]+)\/?/i);
    var slug = slugm ? slugm[1] : "";
    var eps = [];
    var re = /href="https?:\/\/kissasian\.cam\/([a-z0-9-]+-episode-(\d+))\/"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      if (slug && m[1].indexOf(slug + "-episode-") !== 0) continue;
      eps.push({ path: m[1], num: parseInt(m[2], 10) });
    }
    var i;
    for (i = 0; i < eps.length; i++) {
      if (eps[i].num === wantEp) return KISSASIAN_BASE + "/" + eps[i].path + "/";
    }
    // construct fallback (slug pattern is uniform on this site)
    if (slug) return KISSASIAN_BASE + "/" + slug + "-episode-" + wantEp + "/";
    return "";
  }).catch(function() {
    var slugm = seriesUrl.match(/\/series\/([a-z0-9-]+)\/?/i);
    return slugm ? KISSASIAN_BASE + "/" + slugm[1] + "-episode-" + wantEp + "/" : "";
  });
}

/**
 * Runs the captcha-gated Byse API on justplay.cam for one video code.
 * Flow documented in the header. Returns { url, quality } or null.
 */
function byseResolve(code, refererUrl) {
  var embedHeaders = {
    "Referer": refererUrl || (KISSASIAN_BASE + "/"),
    "X-Embed-Origin": KISSASIAN_BASE,
    "X-Embed-Referer": refererUrl || (KISSASIAN_BASE + "/"),
    "X-Embed-Parent": KISSASIAN_BASE
  };
  var fingerprint = { device_id: "nuvio", confidence: 0.9 };
  return postJson(JUSTPLAY_BASE + "/api/videos/" + code + "/embed/captcha", { fingerprint: fingerprint }, embedHeaders)
    .then(function(ch) {
      var c = ch.data;
      if (!c || !c.pow_nonce || !c.pow_token || ch.status !== 200) return null;
      var solution = byseSolvePow(c.pow_nonce, parseInt(c.pow_difficulty, 10) || 16, POW_MAX_MS);
      if (solution === null) return null;
      return postJson(JUSTPLAY_BASE + "/api/videos/" + code + "/embed/captcha/verify",
        { pow_token: c.pow_token, solution: solution }, embedHeaders).then(function(vr) {
        var v = vr.data;
        if (!v || v.status !== "ok" || !v.token) return null;
        var headers = merge(embedHeaders, { "X-Captcha-Token": v.token });
        return postJson(JUSTPLAY_BASE + "/api/videos/" + code + "/embed/playback",
          { fingerprint: fingerprint }, headers).then(function(pr) {
          var body = pr.data;
          if (!body || !body.playback) return null;
          var pb = body.playback;
          if (!pb || !pb.payload || !pb.iv || pb.algorithm !== "AES-256-GCM") return null;
          var keyBytes = byseKeyFromParts(pb);
          if (!keyBytes || keyBytes.length !== 32) return null;
          var plain = aesGcmDecryptNoTag(keyBytes, b64urlToBytes(pb.iv), b64urlToBytes(pb.payload));
          if (!plain.length) return null;
          var info = null;
          try { info = JSON.parse(bytesToUtf8(plain)); } catch (e) { return null; }
          var sources = (info && info.sources) || [];
          var best = null, bestH = -1, i, s, h;
          for (i = 0; i < sources.length; i++) {
            s = sources[i];
            if (!s || !s.url || String(s.url).indexOf("http") !== 0) continue;
            h = parseInt(s.height, 10) || 0;
            if (h >= bestH) { bestH = h; best = s; }
          }
          if (!best) return null;
          var q = (best.label && best.label !== "x")
            ? (parseInt(best.height, 10) ? best.height + "p" : String(best.label))
            : (parseInt(best.height, 10) ? best.height + "p" : "Auto");
          // v2.0.0 TV-SAFE: Byse signed URLs are self-authorizing, no
          // playback headers attached (same policy as pinoyhub.js).
          return { url: String(best.url), quality: q };
        });
      });
    }).catch(function() { return null; });
}

function kissasianExtract(episodeUrl) {
  if (!episodeUrl) return Promise.resolve(null);
  // v2.2.0: an episode page exposes MULTIPLE player servers as /v/N/
  // sub-paths, and the family varies PER SHOW (verified live:
  //   v/1 default embed = justplay (Byse) on some shows, drive.google.com
  //   placeholder on others; /v/2/ = vidmoly OR dooood.com; /v/3/ = mxdrop
  //   OR likessb.com). Probe root + /v/2/ + /v/3/, identify each embed
  //   family, and return the first successful extraction.
  var versions = [
    episodeUrl,
    episodeUrl.replace(/\/+$/, "") + "/v/2/",
    episodeUrl.replace(/\/+$/, "") + "/v/3/"
  ];
  return kissasianProbeServers(versions, 0);
}

function kissasianProbeServers(versions, idx) {
  if (idx >= versions.length) return Promise.resolve(null);
  var pageUrl = versions[idx];
  return fetchText(pageUrl, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
    return kissasianExtractOneFamily(html, pageUrl).then(function(r) {
      if (r) return r;
      return kissasianProbeServers(versions, idx + 1);
    });
  }).catch(function() {
    return kissasianProbeServers(versions, idx + 1);
  });
}

/** Identifies the embed family on one kissasian server page and extracts. */
function kissasianExtractOneFamily(html, pageUrl) {
  var iframe = html.match(/<iframe[^>]*src="(https?:\/\/[^"\s]+)"/i);
  var embedUrl = iframe ? iframe[1] : "";
  var host = hostOf(embedUrl);

  // family 1: justplay (Byse PoW chain) — the show's default server
  var jp = embedUrl.match(/justplay\.cam\/e\/([a-z0-9]+)/i) || html.match(/https?:\/\/justplay\.cam\/e\/([a-z0-9]+)/i);
  if (jp) {
    return byseResolve(jp[1], pageUrl).then(function(r) {
      if (!r) return null;
      r.source = "KissAsian";
      r.host = hostOf(r.url);
      return r;
    });
  }
  // placeholder/unusable families: skip cleanly
  if (host.indexOf("drive.google") !== -1) return Promise.resolve(null);
  // family 2: vidmoly (plain m3u8 leak)
  if (host.indexOf("vidmoly") !== -1) {
    return vidmolyEmbedM3u8(embedUrl, pageUrl).then(function(r) {
      if (!r) return null;
      r.source = "KissAsian";
      r.host = hostOf(r.url);
      return r;
    });
  }
  // family 2b: Mixdrop family (mxdrop et al -> packed player -> direct mp4).
  // v2.3.0: checked BEFORE the generic /e/{id}.html m3u8-leak family because
  // mxdrop embeds share that URL shape but carry a packed wurl, not an m3u8.
  if (isMixdropFamily(host)) {
    return extractMixdropDirect(embedUrl, pageUrl).then(function(r) {
      if (!r) return null;
      r.source = "KissAsian";
      r.host = hostOf(r.url);
      return r;
    });
  }
  // family 3: Dood clones (dooood.com et al -> direct mp4 via pass_md5)
  if (doodFamilyHost(host)) {
    return extractDoodDirect(embedUrl, pageUrl).then(function(r) {
      if (!r) return null;
      r.source = "KissAsian";
      r.host = hostOf(r.url);
      return r;
    });
  }
  // family 4: unknown /e/{id}.html embed (likessb, filemoon-style) — try
  // the plain m3u8 leak before giving up
  if (embedUrl && /\/e\/[a-z0-9]+\.html/i.test(embedUrl)) {
    return vidmolyEmbedM3u8(embedUrl, pageUrl).then(function(r) {
      if (!r) return null;
      r.source = "KissAsian";
      r.host = hostOf(r.url);
      return r;
    });
  }
  return Promise.resolve(null);
}

function kissasianLane(tmdb, isSeries, season, episode) {
  var wantEp = isSeries ? (parseInt(episode, 10) || 1) : 1;
  return kissasianSearchSeriesUrl(tmdb).then(function(seriesUrl) {
    if (!seriesUrl) return null;
    return kissasianFindEpisodeUrl(seriesUrl, wantEp).then(function(epUrl) {
      return kissasianExtract(epUrl);
    });
  });
}

// ===== SOURCE 2: ViewAsian (viewasian.lol -> kisskh.space -> vidmoly) =====

/**
 * Search rows: <a href="https://viewasian.lol/drama/{slug}/" class="img"
 * title="Show (2024)">. Returns the best-matching drama page URL.
 */
function viewasianSearchDramaUrl(tmdb) {
  // Title first, then the ORIGINAL title (same rationale as kissasian).
  var attempts = [];
  if (tmdb.title) attempts.push(tmdb.title);
  if (tmdb.original && attempts.indexOf(tmdb.original) === -1) attempts.push(tmdb.original);
  if (!attempts.length) return Promise.resolve("");
  var normTitle = normalizeTitle(tmdb.title);
  var normOrig = normalizeTitle(tmdb.original);
  function runSearch(query) {
    var url = VIEWASIAN_BASE + "/?s=" + encodeURIComponent(query);
    return fetchText(url, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
      var best = "", bestScore = 0;
      var seen = {};
      // a-tag attribute order varies; capture the whole tag then pick title=
      var re = /<a href="(https?:\/\/viewasian\.lol\/drama\/[a-z0-9-]+\/?)"([^>]*)>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slugm = m[1].match(/\/drama\/([a-z0-9-]+?)\/?$/i);
        if (!slugm || seen[slugm[1]]) continue;
        seen[slugm[1]] = true;
        var tm = m[2].match(/title="([^"]+)"/i);
        if (!tm) continue;
        var tNorm = normalizeTitle(tm[1]);
        var score = Math.max(titleScore(normTitle, tNorm), titleScore(normOrig, tNorm));
        if (score > bestScore) {
          bestScore = score;
          best = m[1];
        }
      }
      return bestScore >= 1.5 ? best : "";
    }).catch(function() { return ""; });
  }
  return runSearch(attempts[0]).then(function(best) {
    if (best || attempts.length < 2) return best;
    return runSearch(attempts[1]);
  });
}

/**
 * Drama page -> episode list. Link shapes seen live:
 *   - "/{show}-ep-{n}-eng-sub-drama/"  (server variants add "-1"/"-2")
 *   - "/{show}-ep-{n}-eng-sub/"        (tail varies per show)
 *   - "/{show}-episode-{n}-english-sub/"
 *   - movies: "/{show}-full-hd-movie/" (single watch page)
 * The tail is not assumed; the link with the SHORTEST suffix (main server)
 * wins for TV. Movies resolve through their -full-hd-movie page.
 */
function viewasianFindEpisodeUrl(dramaUrl, wantEp, isSeries) {
  if (!dramaUrl) return Promise.resolve("");
  return fetchText(dramaUrl, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
    var moviePath = "";
    var links = {};
    var re = /href="https?:\/\/viewasian\.lol\/([a-z0-9-]+-(?:ep|episode)-(\d+)(-[a-z0-9-]+)?)\/"/gi;
    var mre = /href="https?:\/\/viewasian\.lol\/([a-z0-9-]+-(?:full-hd-)?movie)\/"/i;
    var mm = html.match(mre);
    if (mm) moviePath = mm[1];
    var m;
    while ((m = re.exec(html)) !== null) {
      var num = parseInt(m[2], 10);
      var tail = m[3] || "";
      var svm = tail.match(/^-(\d+)(?:-|$)/);
      var sv = svm ? parseInt(svm[1], 10) : 0;
      var key = num + "-" + sv;
      if (!links[key] || tail.length < links[key].tailLen) {
        links[key] = { path: m[1], num: num, sv: sv, tailLen: tail.length };
      }
    }
    if (!isSeries) {
      // movies: the -full-hd-movie page first, then lowest episode number
      if (moviePath) return VIEWASIAN_BASE + "/" + moviePath + "/";
      var lo = null, k;
      for (k in links) {
        if (!lo || links[k].num < lo.num) lo = links[k];
      }
      return lo ? VIEWASIAN_BASE + "/" + lo.path + "/" : "";
    }
    var bestMain = null, bestAlt = null, k2;
    for (k2 in links) {
      var e = links[k2];
      if (e.num !== wantEp) continue;
      if (e.sv === 0) {
        if (!bestMain || e.tailLen < bestMain.tailLen) bestMain = e;
      } else {
        if (!bestAlt || e.sv < bestAlt.sv) bestAlt = e;
      }
    }
    var picked = bestMain || bestAlt;
    return picked ? VIEWASIAN_BASE + "/" + picked.path + "/" : "";
  }).catch(function() { return ""; });
}

/**
 * vidmoly-family embed finder (v2.2.0, shared). The embed iframe src may
 * carry escaped slashes; normalize them.
 */
function findVidmolyEmbed(html) {
  var em = html.match(/<iframe[^>]*src="(https?:\/\/[^"]*vidmoly[^"]*\/embed-[a-z0-9]+\.html)"/i);
  if (em) return em[1].replace(/\\u002F/gi, "/");
  em = html.match(/(https?:\/\/[a-z0-9.-]*vidmoly[a-z0-9.-]*\/embed-[a-z0-9]+\.html)/i);
  return em ? em[1].replace(/\\u002F/gi, "/") : null;
}

/**
 * vidmoly-family embed page -> direct HLS (v2.2.0, shared). The player is
 * wrapped in an eval packer but the playlist URL leaks as a plain string;
 * verified live on both the viewasian chain and kissasian /v/2/ pages.
 */
function vidmolyEmbedM3u8(embedUrl, referer) {
  return fetchText(embedUrl, {
    headers: referer ? { "Referer": referer } : {},
    timeoutMs: EMBED_TIMEOUT_MS
  }).then(function(embedHtml) {
    var mm = embedHtml.match(/(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
    if (!mm) return null;
    var m3u8 = mm[1].replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    return resolveHls(m3u8, embedUrl, "");
  }).catch(function() { return null; });
}

/**
 * viewasian episode page -> kisskh.space iframe -> vidmoly iframe -> m3u8.
 * The listing markup embeds the player iframe as data-src (both src= and
 * data-src= are matched by the loose [^>]*src= pattern). The vidmoly embed
 * page obfuscates its player with an eval packer but the playlist URL
 * leaks as a plain string.
 */
function viewasianExtract(episodeUrl) {
  if (!episodeUrl) return Promise.resolve(null);
  return fetchText(episodeUrl, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(html) {
    var m = html.match(/<iframe[^>]*src="(https?:\/\/kisskh\.space\/[a-z0-9-]+\/?)"/i);
    if (!m) m = html.match(/(https?:\/\/kisskh\.space\/[a-z0-9-]+\/?)/i);
    if (!m) return null;
    var playerUrl = m[1].replace(/\\u002F/gi, "/");
    return fetchText(playerUrl, {
      headers: { "Referer": VIEWASIAN_BASE + "/" },
      timeoutMs: EMBED_TIMEOUT_MS
    }).then(function(playerHtml) {
      var embedUrl = findVidmolyEmbed(playerHtml);
      if (!embedUrl) return null;
      return vidmolyEmbedM3u8(embedUrl, playerUrl).then(function(r) {
        if (!r) return null;
        r.source = "ViewAsian";
        r.host = hostOf(r.url);
        return r;
      });
    });
  }).catch(function() { return null; });
}

function viewasianLane(tmdb, isSeries, season, episode) {
  var wantEp = isSeries ? (parseInt(episode, 10) || 1) : 1;
  return viewasianSearchDramaUrl(tmdb).then(function(dramaUrl) {
    if (!dramaUrl) return null;
    return viewasianFindEpisodeUrl(dramaUrl, wantEp, isSeries).then(function(epUrl) {
      return viewasianExtract(epUrl);
    });
  });
}

// ===== SOURCE 3: KissKH (kisskh.co API, kisskh.ovh fallback) =====
// Ported from providers/kisskh.js v4.0.0 (proven on devices). KissKH is
// Cloudflare-challenged from datacenter IPs but serves Nuvio clients
// normally; kisskh.nl (proven working on mobile ISPs) is tried first, then
// kisskh.co, kisskh.ovh as automatic fallbacks when a request errors.

function kisskhFetchJson(path) {
  var idx = 0;
  function attempt() {
    if (idx >= KISSKH_BASES.length) return Promise.resolve(null);
    var base = KISSKH_BASES[idx++];
    return fetchJson(base + path, { timeoutMs: EMBED_TIMEOUT_MS }).then(function(data) {
      if (data) return data;
      return attempt();
    }).catch(function(e) {
      // network/HTTP failure on this mirror - fall through to the next one
      return attempt();
    });
  }
  return attempt();
}

/**
 * Levenshtein + token similarity scoring, ported from kisskh.js v4.0.0
 * (threshold 6000 proved a good confidence bar on live catalogs).
 */
function levenshtein(a, b) {
  var matrix = [];
  for (var i = 0; i <= b.length; i++) matrix[i] = [i];
  for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarityScore(query, candidate) {
  var q = query.toLowerCase().trim();
  var c = candidate.toLowerCase().trim();
  if (q === c) return 10000;
  var qClean = "", cClean = "", i, ch;
  for (i = 0; i < q.length; i++) {
    ch = q.charAt(i);
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") qClean += ch;
  }
  for (i = 0; i < c.length; i++) {
    ch = c.charAt(i);
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") cClean += ch;
  }
  qClean = qClean.trim();
  cClean = cClean.trim();
  if (qClean === cClean) return 9500;
  var qWords = qClean.split(" ");
  var cWords = cClean.split(" ");
  if (qWords.length >= 2) {
    var allFound = true;
    for (i = 0; i < qWords.length; i++) {
      var found = false;
      for (var j = 0; j < cWords.length; j++) {
        if (qWords[i] === cWords[j]) { found = true; break; }
      }
      if (!found) { allFound = false; break; }
    }
    if (allFound) {
      if (cWords.length === qWords.length) {
        var totalDist = 0;
        for (i = 0; i < qWords.length; i++) {
          if (qWords[i] !== cWords[i]) {
            if (qWords[i].indexOf(cWords[i]) !== -1 || cWords[i].indexOf(qWords[i]) !== -1) {
              totalDist += Math.abs(qWords[i].length - cWords[i].length) * 2;
            } else {
              totalDist += Math.max(qWords[i].length, cWords[i].length);
            }
          }
        }
        if (totalDist <= 2) return 9000;
        if (totalDist <= 5) return 7000;
        return 5000;
      }
      var extraCount = cWords.length - qWords.length;
      if (extraCount <= 2) return 8000 - extraCount * 100;
      return 4000;
    }
    return 0;
  }
  if (qClean.indexOf(cClean) !== -1) return 6000;
  if (cClean.indexOf(qClean) !== -1) return 5500;
  var dist = levenshtein(qClean, cClean);
  var maxLen = Math.max(qClean.length, cClean.length);
  if (maxLen === 0) return 0;
  return Math.floor((1 - dist / maxLen) * 4000);
}

function kisskhSearch(title) {
  var q = String(title || "");
  if (!q) return Promise.reject(new Error("no title"));
  return kisskhFetchJson("/api/DramaList/Search?q=" + encodeURIComponent(q) + "&type=0").then(function(list) {
    if (!list || !Array.isArray(list) || !list.length) throw new Error("no kisskh results");
    var best = null, bestScore = -1, i;
    for (i = 0; i < list.length; i++) {
      var item = list[i];
      var itemTitle = String(item && item.title || "");
      var clean = itemTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      var score = similarityScore(q, clean);
      if (score > bestScore) { bestScore = score; best = item; }
    }
    if (!best || bestScore < 6000) throw new Error("no confident kisskh match (score " + bestScore + ")");
    return best;
  });
}

function kisskhDetail(dramaId) {
  return kisskhFetchJson("/api/DramaList/Drama/" + dramaId + "?isq=false").then(function(detail) {
    if (!detail || !detail.episodes || !detail.episodes.length) throw new Error("no kisskh episodes");
    return detail;
  });
}

function kisskhFindEpisode(episodes, mediaType, episodeNum) {
  var targetNum = parseInt(episodeNum, 10);
  var i;
  if (mediaType === "movie") return episodes[episodes.length - 1];
  for (i = 0; i < episodes.length; i++) {
    if (parseInt(episodes[i].number, 10) === targetNum) return episodes[i];
  }
  var idx = targetNum - 1;
  if (idx >= 0 && idx < episodes.length) return episodes[idx];
  for (i = 0; i < episodes.length; i++) {
    if (String(episodes[i].number || "").indexOf(String(targetNum)) !== -1) return episodes[i];
  }
  throw new Error("kisskh episode " + episodeNum + " not found");
}

// ---- v2.5.0: local kkey generation (v2.8.10 algorithm, ported from
// kisskh.js 4.2.0 where it is byte-verified 16/16 against the reference and
// the Google Script API). Used as PRIMARY so the kisskh lane works even when
// both the site keygen and the external script are unreachable.
var KKEY_ROUND_KEYS = [
  0x4f6bdaa3, -0x61d07350, 0x7f5e722d, -0x61210cec,
  0x536620a8, -0x32b653e8, -0x4de821cb, 0x2cc92d21,
  -0x73412227, 0x41f771c1, -0xc1f500c, -0x20d67d2b,
  0x2dadde47, 0x6c5aaf86, -0x6045ff8e, 0x409382a7,
  -0x6417db2, -0x6a1bd238, 0xa5e2dba, 0x4acdaf1d,
  0x54c72698, -0x3edcf4b0, -0x3482d916, -0x7e4f7609,
  -0x6c9fb16c, 0x524345c4, -0x66c19cd2, 0x188eead9,
  -0x351884c7, -0x675bc103, 0x19a5dd3, 0x1914b70a,
  -0x4fb1e313, 0x28ea2210, 0x29707fc3, 0x3064c8c9,
  -0x17593e17, -0x3fb31c07, -0x16c363c6, -0x26a7ab0d,
  -0x4b793324, 0x74ca2f25, -0x62094ce1, 0x44aee7ec
];
var KKEY_IV = [0x1504af3, 0x56e619cf, 0x2e42bba6, -0x73c08f07];
var _kkeyTables = null;

function kkeyCalculateHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
  }
  return hash;
}

function kkeyWordsToHex(words) {
  var out = '';
  for (var i = 0; i < words.length; i++) {
    var hex = (words[i] >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    out += hex;
  }
  return out.toUpperCase();
}

function kkeyBuildTables() {
  var pow = [];
  for (var i = 0; i < 256; i++) pow[i] = i < 128 ? (i << 1) : ((i << 1) ^ 0x11b);
  var sbox = [], T1 = [], T2 = [], T3 = [], T4 = [];
  var x = 0, xi = 0;
  for (var j = 0; j < 256; j++) {
    var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
    sx = (sx >>> 8) ^ (0xff & sx) ^ 0x63;
    sbox[x] = sx;
    var x2 = pow[x];
    var x8 = pow[pow[x2]];
    var w = 0x101 * pow[sx] ^ 0x1010100 * sx;
    T1[x] = (w << 0x18) | (w >>> 0x8);
    T2[x] = (w << 0x10) | (w >>> 0x10);
    T3[x] = (w << 0x8) | (w >>> 0x18);
    T4[x] = w;
    if (x) {
      x = x2 ^ pow[pow[pow[x8 ^ x2]]];
      xi ^= pow[pow[xi]];
    } else {
      x = xi = 1;
    }
  }
  return [T1, T2, T3, T4, sbox];
}

function kkeyEncrypt(plaintext) {
  if (!_kkeyTables) _kkeyTables = kkeyBuildTables();
  var T1 = _kkeyTables[0], T2 = _kkeyTables[1], T3 = _kkeyTables[2], T4 = _kkeyTables[3], sbox = _kkeyTables[4];

  var data = plaintext;
  var padLen = 16 - (plaintext.length % 16);
  for (var p = 0; p < padLen; p++) data += String.fromCharCode(padLen);

  var words = [];
  for (var i = 0; i < data.length; i += 4) {
    words.push(
      data.charCodeAt(i) << 0x18 |
      data.charCodeAt(i + 1) << 0x10 |
      data.charCodeAt(i + 2) << 0x8 |
      data.charCodeAt(i + 3)
    );
  }

  var keys = KKEY_ROUND_KEYS;

  for (var block = 0; block < words.length; block += 4) {
    var roundKey = block === 0 ? KKEY_IV : words.slice(block - 4, block);

    for (var k = 0; k < 4; k++) words[block + k] ^= roundKey[k];

    var s0 = words[block] ^ keys[0];
    var s1 = words[block + 1] ^ keys[1];
    var s2 = words[block + 2] ^ keys[2];
    var s3 = words[block + 3] ^ keys[3];
    var tIdx = 4;

    for (var round = 1; round < 10; round++) {
      var t0 = T1[s0 >>> 0x18] ^ T2[(s1 >>> 0x10) & 0xff] ^ T3[(s2 >>> 0x8) & 0xff] ^ T4[s3 & 0xff] ^ keys[tIdx++];
      var t1 = T1[s1 >>> 0x18] ^ T2[(s2 >>> 0x10) & 0xff] ^ T3[(s3 >>> 0x8) & 0xff] ^ T4[s0 & 0xff] ^ keys[tIdx++];
      var t2 = T1[s2 >>> 0x18] ^ T2[(s3 >>> 0x10) & 0xff] ^ T3[(s0 >>> 0x8) & 0xff] ^ T4[s1 & 0xff] ^ keys[tIdx++];
      s3 = T1[s3 >>> 0x18] ^ T2[(s0 >>> 0x10) & 0xff] ^ T3[(s1 >>> 0x8) & 0xff] ^ T4[s2 & 0xff] ^ keys[tIdx++];
      s0 = t0; s1 = t1; s2 = t2;
    }

    words[block]     = ((sbox[s0 >>> 0x18] << 0x18) | (sbox[(s1 >>> 0x10) & 0xff] << 0x10) | (sbox[(s2 >>> 0x8) & 0xff] << 0x8) | sbox[s3 & 0xff]) ^ keys[tIdx++];
    words[block + 1] = ((sbox[s1 >>> 0x18] << 0x18) | (sbox[(s2 >>> 0x10) & 0xff] << 0x10) | (sbox[(s3 >>> 0x8) & 0xff] << 0x8) | sbox[s0 & 0xff]) ^ keys[tIdx++];
    words[block + 2] = ((sbox[s2 >>> 0x18] << 0x18) | (sbox[(s3 >>> 0x10) & 0xff] << 0x10) | (sbox[(s0 >>> 0x8) & 0xff] << 0x8) | sbox[s1 & 0xff]) ^ keys[tIdx++];
    words[block + 3] = ((sbox[s3 >>> 0x18] << 0x18) | (sbox[(s0 >>> 0x10) & 0xff] << 0x10) | (sbox[(s1 >>> 0x8) & 0xff] << 0x8) | sbox[s2 & 0xff]) ^ keys[tIdx++];
  }

  return kkeyWordsToHex(words);
}

var KKEY_SUB_SALT = 'VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp';
var KKEY_VIDEO_SALT = '62f176f3bb1b5b8e70e39932ad34a0c7';

function generateKkeyLocal(epsId, isSub) {
  var fields = [
    '', epsId.toString(), '', 'mg3c3b04ba', '2.8.10',
    isSub ? KKEY_SUB_SALT : KKEY_VIDEO_SALT,
    '4830201', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh',
    '00', ''
  ];
  var hash = kkeyCalculateHash(fields.join('|'));
  fields.splice(1, 0, hash.toString());
  return kkeyEncrypt(fields.join('|'));
}

function kisskhGenerateKey(epsId) {
  // PRIMARY: compute locally (no external dependency)
  try {
    var localKey = generateKkeyLocal(epsId, false);
    if (localKey && localKey.length >= 32) return Promise.resolve(localKey);
  } catch (e) { /* fall through to network keygen */ }
  return kisskhFetchJson("/keygen?id=" + epsId + "&version=2.8.10").then(function(k) {
    if (k && k.key) return k.key;
    // fall back to the Google Apps Script key generator used by kisskh.js
    return fetchJson(KISSKH_KEY_API + "?id=" + epsId + "&version=2.8.10", { timeoutMs: EMBED_TIMEOUT_MS }).then(function(k2) {
      if (k2 && k2.key) return k2.key;
      throw new Error("kisskh keygen failed");
    });
  });
}

function kisskhVideoSources(epsId, key) {
  return kisskhFetchJson("/api/DramaList/Episode/" + epsId + ".png?err=false&ts=&time=&kkey=" + encodeURIComponent(key))
    .then(function(sources) {
      if (!sources) throw new Error("empty kisskh video response");
      return sources;
    });
}

/**
 * v2.6.0: shared kisskh tail — keygen -> video sources -> headerless probe /
 * HLS resolution. Used by BOTH the search-based kisskhLane and the new
 * kh-<dramaId> direct lane.
 */
function kisskhPlayEpisode(info) {
  return kisskhGenerateKey(info.ep.id).then(function(key) {
    return kisskhVideoSources(info.ep.id, key).then(function(sources) {
      var links = [];
      if (sources.Video) links.push(sources.Video);
      if (sources.Video_tmp) links.push(sources.Video_tmp);
      if (sources.ThirdParty) links.push(sources.ThirdParty);
      if (!links.length) return null;
      var link = links[0];
      var isM3u8 = link.indexOf(".m3u8") !== -1;
      if (!isM3u8 && link.indexOf(".mp4") === -1) return null;
      var base = KISSKH_BASES[0];
      var headers = {
        "Origin": base,
        "Referer": base + "/",
        "User-Agent": HEADERS["User-Agent"]
      };
      var qm = link.match(/_(\d+p)_/i);
      var q = qm ? qm[1] : (/1080p/i.test(link) ? "1080p" : (/720p/i.test(link) ? "720p" : "Auto"));
      return resolveHls(link, base + "/", "KissKH").then(function(r) {
        if (!r) r = { url: link, quality: "" };
        r.quality = r.quality || q;
        r.source = "KissKH";
        r.host = hostOf(r.url);
        r.headers = headers;
        return r;
      });
    });
  });
}

function kisskhLane(tmdb, isSeries, season, episode) {
  var wantEp = isSeries ? String(episode) : "";
  var title = tmdb.title || tmdb.original || "";
  if (!title) return Promise.resolve(null);
  // Title first, then ORIGINAL title (native-language listings).
  var attempts = [title];
  if (tmdb.original && tmdb.original !== title) attempts.push(tmdb.original);
  function runAttempt(idx) {
    if (idx >= attempts.length) return Promise.reject(new Error("no kisskh results"));
    return kisskhSearch(attempts[idx]).catch(function() {
      return runAttempt(idx + 1);
    });
  }
  return runAttempt(0).then(function(drama) {
    return kisskhDetail(drama.id).then(function(detail) {
      var ep = kisskhFindEpisode(detail.episodes, isSeries ? "tv" : "movie", wantEp || 1);
      return { drama: drama, ep: ep };
    });
  }).then(kisskhPlayEpisode).catch(function() { return null; });
}

/**
 * v2.6.0 DIRECT LANE for asian:kh-<dramaId> rows (asian-catalog v4.0.0):
 * the tail IS the kisskh numeric drama id, so no search is needed at all —
 * straight to detail -> episode -> kkey -> stream, riding the same mirror
 * rotation as every kisskh request.
 */
function kisskhDirectLane(dramaId, isSeries, season, episode) {
  var id = String(dramaId || "").trim();
  if (!id || !/^\d+$/.test(id)) return Promise.resolve(null);
  var wantEp = isSeries ? (parseInt(episode, 10) || 1) : 1;
  console.log("[AsianHub] kisskh direct lane: dramaId=" + id + " ep=" + wantEp);
  return kisskhDetail(id).then(function(detail) {
    var ep = kisskhFindEpisode(detail.episodes, isSeries ? "tv" : "movie", wantEp);
    return { drama: detail, ep: ep };
  }).then(kisskhPlayEpisode).catch(function(err) {
    console.log("[AsianHub] kisskh direct lane failed: " + ((err && err.message) || err));
    return null;
  });
}

// ===== v2.2.0 DIRECT LANES (source-scoped catalog ids asian:ks- / asian:va-) =====
// The catalog tail slug IS the source site's own page slug, so these lanes
// navigate the real site structure with ZERO title searching — the fix for
// "the plugin not fetching because the url is different to the website".

/** asian:ks-<slug> -> kissasian.cam/series/{slug}/ -> episode -> extract. */
function kissasianDirectLane(slug, season, episode) {
  if (!slug) return Promise.resolve(null);
  var wantEp = parseInt(episode, 10) || 1;
  var seriesUrl = KISSASIAN_BASE + "/series/" + slug + "/";
  return kissasianFindEpisodeUrl(seriesUrl, wantEp).then(function(epUrl) {
    return kissasianExtract(epUrl);
  });
}

/** asian:va-<slug> -> viewasian.lol/drama/{slug}/ -> episode -> extract. */
function viewasianDirectLane(slug, isSeries, season, episode) {
  if (!slug) return Promise.resolve(null);
  var wantEp = isSeries ? (parseInt(episode, 10) || 1) : 1;
  var dramaUrl = VIEWASIAN_BASE + "/drama/" + slug + "/";
  return viewasianFindEpisodeUrl(dramaUrl, wantEp, isSeries).then(function(epUrl) {
    return viewasianExtract(epUrl);
  });
}

// ===== MAIN ENTRY =====

function getStreams(tmdbId, mediaType, season, episode) {
  // Legacy signatures:
  //   getStreams(tmdbId, season, episode)               -> mediaType undefined
  //   getStreams(tmdbId, mediaType, season, episode)    -> Nuvio contract (4 args)
  // NuvioTVSmart's local-id plugin path passes the catalog type verbatim
  // ("series"), so normalize before the legacy-shift check.
  var mt = String(mediaType === undefined || mediaType === null ? "" : mediaType).toLowerCase();
  if (mt === "series" || mt === "show" || mt === "tv_show" || mt === "tvshow") mt = "tv";
  if (mt !== "movie" && mt !== "tv") {
    episode = season;
    season = mediaType;
    mt = "";
  }

  try { tmdbId = String(tmdbId); } catch (e) { tmdbId = ""; }
  // Tolerate prefixed ids ("tmdb:286988"). NuvioMobile passes the raw
  // catalog meta id when no TMDB API key is configured (ensureTmdbId falls
  // back to the untouched string); a prefixed id would 404 every TMDB
  // request -> a dead row. Strip it defensively.
  tmdbId = tmdbId.replace(/^tmdb:/i, "").trim();
  season = (season === undefined || season === null || season === "") ? "" : String(season).replace(/^s/i, "").replace(/[^0-9]/g, "");
  episode = (episode === undefined || episode === null || episode === "") ? "" : String(episode).replace(/^e/i, "").replace(/[^0-9]/g, "");

  console.log("[AsianHub] === START tmdbId=" + tmdbId + " type=" + mt + " S" + season + "E" + episode + " ===");

  if (!tmdbId) return Promise.resolve([]);

  // v2.5.0: IMDb tt-id input -> resolve to TMDB first (authoritative type
  // pinned from the find hit), then run the normal flow on the resolved id.
  if (/^tt\d+/i.test(tmdbId)) {
    return resolveImdbToTmdb(tmdbId).then(function(hit) {
      if (!hit) {
        console.log("[AsianHub] IMDb id could not be resolved to TMDB: " + tmdbId);
        return [];
      }
      console.log("[AsianHub] IMDb " + tmdbId + " -> TMDB " + hit.tmdbId + " (" + hit.type + ")");
      mt = hit.type;
      tmdbId = hit.tmdbId;
      return getStreamsCore(tmdbId, mt, season, episode);
    }).catch(function(err) {
      console.error("[AsianHub] imdb resolve error:", (err && err.message) || err);
      return [];
    });
  }

  return getStreamsCore(tmdbId, mt, season, episode);
}

function getStreamsCore(tmdbId, mt, season, episode) {
  var forceTv = mt === "tv" || (!!(season && episode) && !mt);

  // asian-catalog fallback rows (asian:<slug>): skip TMDB entirely — the
  // slug is the site's own slug, de-slug it and search the lanes directly.
  var catalogId = parseAsianCatalogId(tmdbId);
  if (catalogId) {
    // v2.2.0 source-scoped routing: pmh rows belong to the PinoyMoviesHub
    // plugin (its direct lanes hit pinoymovieshub.win exactly). Searching
    // them here would waste the runtime budget and risks false-matching an
    // unrelated pinoy title on kissasian/viewasian/kisskh.
    if (catalogId.source === "pmh") {
      console.log("[AsianHub] asian:pmh- id -> handled by PinoyMoviesHub plugin, skipping");
      return Promise.resolve([]);
    }
    // v2.6.0: an- rows belong to the animotvslash plugin — skip fast (no
    // point searching an anime title on the drama sites).
    if (catalogId.source === "an") {
      console.log("[AsianHub] asian:an- id -> handled by AnimeTVSlash plugin, skipping");
      return Promise.resolve([]);
    }
    var catIsSeries = mt === "tv" || !!(season && episode);
    var catMeta = {
      isSeries: catIsSeries,
      season: season,
      episode: episode,
      episodeTitle: ""
    };
    var catDisplay = catIsSeries
      ? catalogId.title + " S" + season + "E" + episode
      : catalogId.title;
    var catPseudo = { type: catIsSeries ? "tv" : "movie", title: catalogId.title, original: catalogId.title, year: "", raw: null };
    console.log("[AsianHub] catalog fallback id -> title=\"" + catalogId.title + "\" isSeries=" + catIsSeries + " source=" + (catalogId.source || "generic"));

    // v2.2.0: scoped rows (ks-/va-) run the DIRECT lane first — it navigates
    // the site's own page for the exact slug, no search involved. When the
    // direct lane comes up empty (site moved a page, listing markup
    // changed) fall back to the generic search lanes so the row still
    // streams. Generic rows (stale CDN cache) run the search lanes only.
    function genericLanes() {
      return withExtractionDeadline([
        function() { return kissasianLane(catPseudo, catIsSeries, season, episode); },
        function() { return viewasianLane(catPseudo, catIsSeries, season, episode); },
        function() { return kisskhLane(catPseudo, catIsSeries, season, episode); }
      ], GLOBAL_DEADLINE_MS).then(function(results) {
        var streams = [];
        var seen = {};
        var i, r, s;
        for (i = 0; i < results.length; i++) {
          r = results[i];
          if (!r || !r.url) continue;
          if (seen[r.url]) continue;
          seen[r.url] = true;
          s = buildStream(catDisplay, catMeta, r);
          streams.push(s);
        }
        return streams;
      });
    }

    if (catalogId.source === "ks" || catalogId.source === "va" || catalogId.source === "kh") {
      var directP;
      if (catalogId.source === "ks") directP = kissasianDirectLane(catalogId.slug, season, episode);
      else if (catalogId.source === "va") directP = viewasianDirectLane(catalogId.slug, catIsSeries, season, episode);
      else directP = kisskhDirectLane(catalogId.slug, catIsSeries, season, episode);
      return directP.then(function(r) {
        if (r && r.url) {
          console.log("[AsianHub] direct lane hit (" + catalogId.source + ") -> " + r.url);
          return [buildStream(catDisplay, catMeta, r)];
        }
        console.log("[AsianHub] direct lane (" + catalogId.source + ") empty -> generic search lanes");
        return genericLanes();
      }).then(function(streams) {
        console.log("[AsianHub] Returning " + streams.length + " stream(s) (catalog " + catalogId.source + ")");
        return streams;
      }).catch(function(err) {
        console.error("[AsianHub] catalog direct error:", (err && err.message) || err);
        return [];
      });
    }

    return genericLanes().then(function(streams) {
      console.log("[AsianHub] Returning " + streams.length + " stream(s) (catalog fallback)");
      return streams;
    }).catch(function(err) {
      console.error("[AsianHub] catalog fallback error:", (err && err.message) || err);
      return [];
    });
  }

  var tmdbPromise = mt === "movie"
    ? tmdbLookup("movie", tmdbId).then(function(r) { return r || getTmdbInfoAuto(tmdbId); })
    : forceTv
      ? tmdbLookup("tv", tmdbId).then(function(r) { return r || { type: "", title: "", original: "", year: "", raw: null }; })
      : getTmdbInfoAuto(tmdbId);

  return tmdbPromise.then(function(tmdb) {
    if (!tmdb || !tmdb.type || !tmdb.title) {
      console.log("[AsianHub] Could not detect media for TMDB ID:", tmdbId);
      return [];
    }
    var type = tmdb.type;
    var isSeries = type === "tv";
    console.log("[AsianHub] type=" + type + " | title=" + tmdb.title + " | year=" + tmdb.year);

    // v2.5.0: several app entry points pass season/episode as null
    // (StreamsScreen.loadSources defaults). Default to S1E1 instead of a
    // dead row (same convention as the app's testScraper).
    if (isSeries && (!season || !episode)) {
      console.log("[AsianHub] season/episode not provided by app - defaulting to S1E1");
      season = "1";
      episode = "1";
    }

    var epPromise = isSeries
      ? getTmdbEpisodeTitle(tmdbId, season, episode)
      : Promise.resolve("");

    return epPromise.then(function(episodeTitle) {
      var meta = {
        isSeries: isSeries,
        season: season,
        episode: episode,
        episodeTitle: episodeTitle
      };
      var displayTitle = isSeries
        ? tmdb.title + " S" + season + "E" + episode
        : tmdb.title;

      // Three lanes run in parallel under the global deadline; each is
      // individually fail-soft so a dead source never blocks the others.
      return withExtractionDeadline([
        function() { return kissasianLane(tmdb, isSeries, season, episode); },
        function() { return viewasianLane(tmdb, isSeries, season, episode); },
        function() { return kisskhLane(tmdb, isSeries, season, episode); }
      ], GLOBAL_DEADLINE_MS).then(function(results) {
        var streams = [];
        var seen = {};
        var i, r, s;
        for (i = 0; i < results.length; i++) {
          r = results[i];
          if (!r || !r.url) continue;
          if (seen[r.url]) continue;
          seen[r.url] = true;
          s = buildStream(displayTitle, meta, r);
          streams.push(s);
        }
        console.log("[AsianHub] Returning " + streams.length + " stream(s)");
        return streams;
      });
    });
  }).catch(function(err) {
    console.error("[AsianHub] error:", (err && err.message) || err);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
