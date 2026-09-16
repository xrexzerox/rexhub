/**
 * tagalogtorrents - Tagalog / Pinoy torrent streams for Nuvio (P2P + debrid).
 *
 * Lanes (all run in parallel, every lane fail-soft):
 *   1. Torrentio    - IMDb-keyed Stremio API (indexes 1337x / TPB / YTS; carries
 *                     Filipino WEB-DL releases for Pinoy titles)
 *   2. TorrentsDB   - IMDb-keyed Stremio API (fresher seed counts, TPB mirror index)
 *   3. ThePirateBay - title search + IMDb search via apibay.org JSON API, all
 *                     categories (works from residential IPs; skipped silently
 *                     when Cloudflare-gated, e.g. datacenters)
 *   4. 1337x        - word-AND search scrape tuned for Tagalog DUBS of foreign
 *                     titles ("<title> tagalog"), detail pages yield infoHash +
 *                     trackers; also picks up the dedicated Pinoy uploads that
 *                     never carry an IMDb mapping. Cloudflare-gated for
 *                     datacenter IPs, fine on residential devices.
 *
 * Tagalog relevance:
 *   - TMDB original_language === "tl" (or a Philippines production) -> the title
 *     itself is Tagalog; all of its releases are kept and labeled Tagalog.
 *   - Foreign titles -> only releases whose name carries Filipino markers
 *     (tagalog / filipino / pinoy / ...) are kept, unless keepAllLanguages is on.
 *   - Filipino-marked releases always rank first.
 *
 * Streams are returned as magnet: URLs (+ infoHash) resolved by Nuvio's P2P
 * engine (NuvioEngine) or a debrid service the user has configured.
 *
 * Sandbox-safe: pure-JS bundle, ES5 promise chains only, zero external
 * modules, chrome56-compatible string APIs, fail-soft everywhere.
 *
 * v1.2.0 (2026-09-10) - app arg-shape hardening (same class as pinoyhub
 * 5.6.0): IMDb tt-id inputs resolve via TMDB find (tt-id kept as the IMDb
 * lane key even on failure); media-type aliases "series"/"show" normalized
 * to "tv" (NuvioTVSmart passes the catalog type verbatim); "tmdb:" prefixed
 * ids tolerated.
 */

var __version = "1.2.0";

// ---------- constants ----------
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var TORRENTIO_API = "https://torrentio.strem.fun/limit=20";
var TORRENTSDB_API = "https://torrentsdb.com/eyJsaW1pdCI6IjIwIn0=";
var APIBAY_BASE = "https://apibay.org";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var LANE_TIMEOUT_MS = 12000;
var TMDB_TIMEOUT_MS = 8000;
var MAX_STREAMS = 25;
var MIN_APIBAY_SEEDERS = 2;

var X1337_BASE = "https://1337x.to";
var X1337_MAX_DETAILS = 6;
var X1337_TIMEOUT_MS = 10000;
var X1337_MIN_SEEDERS = 1;

var FILIPINO_RE = /filipino|tagalog|pinoy|pinay|pilipino|taglish|bisaya|cebuano/i;
var DUB_RE = /dubbed|\bdub\b/i;
var JUNK_RE = /\b(sample|trailer|nfo|readme|proof|password|keygen|cracks?|screens)\b|\.(exe|scr|bat|dll|nfo)\b|free[._-]?download|watch[._-]?online/i;
var HASH_RE = /^[0-9a-f]{40}$|^[a-z2-7]{32}$/i;

var FALLBACK_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://open.demonii.com:1337/announce"
];

var STOPWORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, or: 1, on: 1, in: 1, to: 1, is: 1, ang: 1, ng: 1, sa: 1 };

// ---------- tiny utils ----------
function hasTimers() {
  try {
    return typeof setTimeout === "function" && typeof clearTimeout === "function";
  } catch (e) {
    return false;
  }
}

function fetchWithTimeout(url, options, timeoutMs) {
  if (!hasTimers()) return fetch(url, options || {});
  var timeout = timeoutMs || 10000;
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error("timeout " + timeout + "ms: " + url));
    }, timeout);
    fetch(url, options || {}).then(
      function (res) { clearTimeout(timer); resolve(res); },
      function (err) { clearTimeout(timer); reject(err); }
    );
  });
}

function fetchText(url, timeoutMs) {
  return fetchWithTimeout(url, { headers: { "User-Agent": UA, "Accept": "*/*" } }, timeoutMs).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res.text();
  });
}

function withTimeout(promise, ms, label) {
  if (!hasTimers()) {
    return promise.catch(function () { return []; });
  }
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      console.log("[TagalogTorrents] timeout: " + label);
      resolve([]);
    }, ms);
    promise.then(function (v) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    }, function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve([]);
    });
  });
}

function settings() {
  try {
    return globalThis.SCRAPER_SETTINGS || {};
  } catch (e) {
    return {};
  }
}

function pad2(n) {
  return ("0" + n).slice(-2);
}

// ---------- TMDB ----------
function fetchTmdbMeta(tmdbId, mediaType) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var url = TMDB_BASE_URL + "/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";
  return fetchText(url, TMDB_TIMEOUT_MS).then(function (text) {
    var data = JSON.parse(text);
    var title = type === "tv"
      ? (data.name || data.original_name || "")
      : (data.title || data.original_title || "");
    var originalTitle = data.original_title || data.original_name || title;
    var date = String(data.release_date || data.first_air_date || "");
    var countries = (data.production_countries || []).map(function (c) {
      return (c && (c.iso_3166_1 || c.name)) || "";
    });
    var isPh = countries.indexOf("PH") !== -1 || /philippines/i.test(countries.join(" "));
    return {
      title: title,
      originalTitle: originalTitle,
      year: date ? parseInt(date.substring(0, 4), 10) || null : null,
      imdbId: (data.external_ids && data.external_ids.imdb_id) || null,
      originalLanguage: data.original_language || "",
      isTagalogOriginal: data.original_language === "tl" || isPh
    };
  }).catch(function () {
    return { title: "", originalTitle: "", year: null, imdbId: null, originalLanguage: "", isTagalogOriginal: false };
  });
}

// v1.2.0: the app passes an IMDb tt-id when no TMDB key is configured
// (PluginRepository.ensureTmdbId falls back to the raw id). fetchTmdbMeta
// would 404 on a tt-id -> empty title + null imdbId -> ALL FOUR LANES EMPTY.
// Resolve the tt-id to a TMDB id via the find API (same fix as pinoyhub
// 5.6.0) so meta loads; even when TMDB is unreachable, the tt-id itself is
// used directly as the Stremio/apibay IMDb key so those lanes still work.
function resolveImdbToTmdb(imdbId) {
  var url = TMDB_BASE_URL + "/find/" + encodeURIComponent(String(imdbId)) +
    "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
  return fetchText(url, TMDB_TIMEOUT_MS).then(function (text) {
    var data = JSON.parse(text);
    var tv = (data.tv_results || [])[0];
    var mv = (data.movie_results || [])[0];
    if (tv && tv.id) return { tmdbId: String(tv.id), type: "tv" };
    if (mv && mv.id) return { tmdbId: String(mv.id), type: "movie" };
    return null;
  }).catch(function () {
    return null;
  });
}

// ---------- text parsing ----------
function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\.(mp4|mkv|avi|mov|wmv|iso|ts)\b/g, " ")
    .replace(/[\[\]\(\)\{\}._\-:;,'"\+!@#$%^&\*=?!<>/\\|~\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(title) {
  var parts = normalizeName(title).split(" ");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var w = parts[i];
    if (w.length >= 2 && !STOPWORDS[w] && !/^\d{4}$/.test(w)) out.push(w);
  }
  return out;
}

function tokenCoverage(nameNorm, tokens) {
  if (!tokens.length) return true;
  var hit = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (nameNorm.indexOf(tokens[i]) !== -1) hit++;
  }
  return hit / tokens.length >= 0.6;
}

function isFilipinoRelease(name) {
  return FILIPINO_RE.test(String(name || ""));
}

function isJunk(name) {
  return JUNK_RE.test(String(name || ""));
}

function validHash(h) {
  return typeof h === "string" && HASH_RE.test(h);
}

function parseQuality(name) {
  var s = String(name || "").toLowerCase();
  var m = s.match(/(\d{3,4})\s*p/);
  if (m) {
    var n = parseInt(m[1], 10);
    if (n >= 2000) return "4K";
    if (n >= 1000) return "1080p";
    if (n >= 700) return "720p";
    if (n >= 400) return "480p";
    return "360p";
  }
  if (/\b8k\b/.test(s)) return "8K";
  if (/2160p?|\b4k\b|\buhd\b/.test(s)) return "4K";
  if (/hdcam|\bcam\b|telesync|\bts\b|telecine|dvdscr/.test(s)) return "CAM";
  if (/\bhd\b/.test(s)) return "720p";
  return "Auto";
}

function qualityRank(q) {
  if (q === "8K") return 5;
  if (q === "4K") return 4;
  if (q === "1080p") return 3;
  if (q === "720p") return 2;
  if (q === "480p" || q === "360p") return 1;
  return 0;
}

function humanSize(bytes) {
  var b = parseInt(bytes, 10);
  if (!b || b < 0) return "";
  if (b >= 1073741824) return (Math.round((b / 1073741824) * 100) / 100) + " GB";
  if (b >= 1048576) return Math.round(b / 1048576) + " MB";
  return b + " KB";
}

function parseSeeders(text) {
  var m = String(text || "").match(/(?:👤|👥)\s*([\d,]+)/);
  if (!m) return 0;
  var n = parseInt(m[1].replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function parseSizeText(text) {
  var m = String(text || "").match(/💾\s*([\d.,]+\s*[KMGT]i?B)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function parseTracker(text) {
  var m = String(text || "").match(/⚙️\s*([^\n]+)/);
  if (!m) return "";
  return m[1].trim().split(" ")[0];
}

function parseCodec(name) {
  var s = String(name || "").toLowerCase();
  if (/\b(x265|h\.?265|hevc)\b/.test(s)) return "H.265";
  if (/\b(x264|h\.?264|avc)\b/.test(s)) return "H.264";
  if (/\bxvid\b/.test(s)) return "XviD";
  return "";
}

function parseSource(name) {
  var s = String(name || "").toLowerCase();
  if (/remux/.test(s)) return "REMUX";
  if (/blu[\s._-]*ray|bdrip|brrip/.test(s)) return "BluRay";
  if (/web[\s._-]*dl/.test(s)) return "WEB-DL";
  if (/web[\s._-]*rip/.test(s)) return "WEBRip";
  if (/hdrip/.test(s)) return "HDRip";
  if (/hdtv/.test(s)) return "HDTV";
  if (/dvdrip|dvd[\s._-]*r\b/.test(s)) return "DVDRip";
  if (/hdcam|\bcam\b|telesync|telecine/.test(s)) return "CAM";
  return "";
}

function seasonEpBonus(name, season, episode) {
  if (season == null) return 0;
  var s = String(name || "").toLowerCase();
  var se = String(season);
  var ee = episode == null ? "" : String(episode);
  var patterns = [];
  if (ee) {
    patterns.push(new RegExp("\\bs" + pad2(se) + "e" + pad2(ee) + "\\b"));
    patterns.push(new RegExp("\\bs" + se + "e" + pad2(ee) + "\\b"));
    patterns.push(new RegExp("\\b" + se + "x" + pad2(ee) + "\\b"));
  } else {
    patterns.push(new RegExp("\\bseason[\\s._-]*" + se + "\\b"));
  }
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(s)) return 30;
  }
  if (/complete|collection|\bpack\b|full series|all episodes/.test(s)) return 5;
  return 0;
}

// ---------- magnet ----------
function buildMagnet(infoHash, dn, trackers, fileIdx) {
  var magnet = "magnet:?xt=urn:btih:" + String(infoHash).toLowerCase();
  if (dn) magnet += "&dn=" + encodeURIComponent(String(dn).substring(0, 120));
  var seen = {};
  var list = [];
  (trackers || []).forEach(function (t) {
    if (!t) return;
    var tr = String(t).replace(/^tracker:/i, "").trim();
    if (!/^(udp|https?):\/\//i.test(tr)) return;
    if (seen[tr]) return;
    seen[tr] = true;
    list.push(tr);
  });
  FALLBACK_TRACKERS.forEach(function (t) {
    if (!seen[t]) {
      seen[t] = true;
      list.push(t);
    }
  });
  for (var i = 0; i < list.length; i++) {
    magnet += "&tr=" + encodeURIComponent(list[i]);
  }
  if (fileIdx != null) magnet += "&index=" + parseInt(fileIdx, 10);
  return magnet;
}

// ---------- presentation ----------
function languageLabel(filipino, release, ctx) {
  if (filipino) {
    if (!ctx.isTagalogOriginal && DUB_RE.test(String(release))) return "Tagalog Dub";
    return "Tagalog";
  }
  if (ctx.isTagalogOriginal) return "Tagalog";
  return "";
}

function buildTitle(release, ctx, quality, size, tracker, filipino) {
  var head = "🎬 " + (ctx.originalTitle || ctx.title || "Unknown");
  if (!ctx.isTv && ctx.year) head += " (" + ctx.year + ")";
  if (ctx.isTv && ctx.season != null && ctx.episode != null) {
    head += " - S" + pad2(ctx.season) + "E" + pad2(ctx.episode);
  }
  var line2 = "💎 " + quality + (size ? " • " + size : "") + (tracker ? " | ⚙️ " + tracker : "");
  var bits = [];
  var lang = languageLabel(filipino, release, ctx);
  if (lang) bits.push("🌍 " + lang);
  var codec = parseCodec(release);
  if (codec) bits.push("🎥 " + codec);
  var source = parseSource(release);
  if (source) bits.push("📀 " + source);
  return head + "\n" + line2 + (bits.length ? "\n" + bits.join(" | ") : "");
}

function scoreRelease(r, ctx) {
  var score = 0;
  if (r.filipino) score += 100;
  if (ctx && ctx.isTagalogOriginal) score += 25;
  score += qualityRank(r.quality) * 10;
  score += Math.min(r.seeders || 0, 400) / 20;
  score += r.seasonBonus || 0;
  if (r.tracker) score += 2;
  return score;
}

// ---------- lane 1+2: Stremio-style IMDb-keyed APIs ----------
function parseStremioStreams(sourceName, text, ctx) {
  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return [];
  }
  var streams = (json && json.streams) || [];
  var out = [];
  streams.forEach(function (s) {
    if (!s || !validHash(s.infoHash)) return;
    var label = s.title || s.description || s.name || "";
    var release = (s.behaviorHints && s.behaviorHints.filename) || String(label).split("\n")[0];
    if (isJunk(release)) return;
    var filipino = isFilipinoRelease(release);
    if (!ctx.isTagalogOriginal && !filipino && ctx.keepAllLanguages !== true) return;
    var seeders = parseSeeders(label);
    if (!seeders) return; // never offer torrents without seeders (user rule)
    var size = parseSizeText(label);
    var tracker = parseTracker(label);
    var quality = parseQuality(release);
    var magnet = buildMagnet(s.infoHash, release, (s.sources || []).slice(0, 12), s.fileIdx);
    var stream = {
      name: sourceName + " 👤" + (seeders || "?") + " ⏫" + quality,
      title: buildTitle(release, ctx, quality, size, tracker, filipino),
      url: magnet,
      quality: quality,
      size: size || undefined,
      language: languageLabel(filipino, release, ctx) || undefined,
      seeders: seeders || undefined,
      infoHash: s.infoHash,
      headers: {}
    };
    stream._filipino = filipino;
    stream._score = scoreRelease({ filipino: filipino, quality: quality, seeders: seeders, tracker: tracker }, ctx);
    out.push(stream);
  });
  return out;
}

function stremioLane(sourceName, api, ctx) {
  if (!ctx.imdbId) return Promise.resolve([]);
  var path = ctx.isTv
    ? "/stream/series/" + ctx.imdbId + ":" + (ctx.season || 1) + ":" + (ctx.episode || 1) + ".json"
    : "/stream/movie/" + ctx.imdbId + ".json";
  return withTimeout(
    fetchText(api + path, LANE_TIMEOUT_MS).then(function (text) {
      return parseStremioStreams(sourceName, text, ctx);
    }).catch(function (e) {
      console.log("[TagalogTorrents][" + sourceName + "] " + (e && e.message));
      return [];
    }),
    LANE_TIMEOUT_MS + 2000,
    sourceName
  );
}

// ---------- lane 3: ThePirateBay (title + IMDb, all categories) ----------
function isCloudflareGate(text) {
  var raw = String(text || "");
  return raw.charAt(0) === "<" &&
    /just a moment|cf-browser-verification|challenge-platform/i.test(raw.slice(0, 800));
}

function parseApibay(text, ctx) {
  var raw = String(text || "");
  if (isCloudflareGate(raw)) {
    console.log("[TagalogTorrents][tpb] cloudflare-gated, skipping lane");
    return [];
  }
  var json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!json || !json.length || json[0].noresults) return [];
  var tokens = tokensOf(ctx.title);
  var out = [];
  json.forEach(function (e) {
    if (!e || !validHash(e.info_hash)) return;
    var name = String(e.name || "");
    if (isJunk(name)) return;
    var seeders = parseInt(e.seeders, 10) || 0;
    if (seeders < MIN_APIBAY_SEEDERS) return;
    if (ctx.imdbId && e.imdb && /^tt/i.test(String(e.imdb)) &&
      String(e.imdb).toLowerCase() !== String(ctx.imdbId).toLowerCase()) return;
    if (!tokenCoverage(normalizeName(name), tokens)) return;
    var filipino = isFilipinoRelease(name);
    if (!ctx.isTagalogOriginal && !filipino && ctx.keepAllLanguages !== true) return;
    var quality = parseQuality(name);
    var size = humanSize(e.size);
    var seasonBonus = ctx.isTv ? seasonEpBonus(name, ctx.season, ctx.episode) : 0;
    var magnet = buildMagnet(e.info_hash, name, [], null);
    var stream = {
      name: "TagalogTorrent 👤" + seeders + " ⏫" + quality,
      title: buildTitle(name, ctx, quality, size, "TPB", filipino),
      url: magnet,
      quality: quality,
      size: size || undefined,
      language: languageLabel(filipino, name, ctx) || undefined,
      seeders: seeders,
      infoHash: e.info_hash,
      headers: {}
    };
    stream._filipino = filipino;
    stream._score = scoreRelease(
      { filipino: filipino, quality: quality, seeders: seeders, tracker: "TPB", seasonBonus: seasonBonus },
      ctx
    );
    out.push(stream);
  });
  return out;
}

// Query plan: IMDb-keyed search (exact, catches dub uploads tagged with the
// right IMDb id) + title search. cat=0 searches ALL categories because dub
// uploads land in Movies / HD-TV / Other alike (202 is DVDR and misses TV).
function buildApibayQueries(ctx) {
  var queries = [];
  if (ctx.imdbId) {
    queries.push(APIBAY_BASE + "/q.php?search_imdb=" + encodeURIComponent(ctx.imdbId) + "&cat=0");
  }
  if (ctx.title) {
    queries.push(APIBAY_BASE + "/q.php?q=" + encodeURIComponent(ctx.title) + "&cat=0");
  }
  return queries;
}

function apibayLane(ctx) {
  var queries = buildApibayQueries(ctx);
  if (!queries.length) return Promise.resolve([]);
  return Promise.all(queries.map(function (url) {
    return fetchText(url, LANE_TIMEOUT_MS).then(function (text) {
      return parseApibay(text, ctx);
    }).catch(function (e) {
      console.log("[TagalogTorrents][tpb] " + (e && e.message));
      return [];
    });
  })).then(function (batches) {
    var out = [];
    for (var i = 0; i < batches.length; i++) out = out.concat(batches[i] || []);
    return out;
  });
}

// ---------- lane 4: 1337x (Tagalog-dub focused scrape) ----------
// 1337x search is word-AND, so "<title> tagalog" is a precise dub probe. If it
// comes back empty (dub upload may not exist) we fall back to the plain title,
// which also covers Pinoy originals that never carry an IMDb mapping.
function buildX1337Queries(ctx) {
  var title = String(ctx.title || "").trim();
  if (!title) return [];
  if (ctx.isTagalogOriginal) return [title];
  return [title + " tagalog", title];
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// List page rows (stable 1337x markup):
//   <td class="coll-1 name"><a href="/torrent/<slug>/<id>/">Name</a>
//   <td class="coll-2 seeds">157</td>
//   <td class="coll-4 size">941.6<span class="seeds">MB</span></td>
function parse1337xList(html) {
  var raw = String(html || "");
  if (isCloudflareGate(raw)) {
    console.log("[TagalogTorrents][1337x] cloudflare-gated, skipping lane");
    return [];
  }
  var out = [];
  var chunks = raw.split(/<tr[\s>]/i);
  for (var i = 0; i < chunks.length; i++) {
    var chunk = chunks[i];
    if (chunk.indexOf("coll-1") === -1) continue;
    var hrefM = chunk.match(/href="(\/torrent\/[^"#]+)"/i);
    if (!hrefM) continue;
    var nameM = chunk.match(/<a href="\/torrent\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
    if (!nameM) continue;
    var name = stripTags(nameM[1]);
    if (!name) continue;
    var seedsM = chunk.match(/coll-2[^>]*>[\s\S]{0,40}?([\d,]+)/i);
    var sizeM = chunk.match(/coll-4[^>]*>([\s\S]*?)<\/td>/i);
    out.push({
      name: name,
      href: hrefM[1],
      seeders: seedsM ? parseInt(seedsM[1].replace(/,/g, ""), 10) || 0 : 0,
      size: sizeM ? stripTags(sizeM[1]) : ""
    });
  }
  return out;
}

// Detail page: the infoHash + trackers live inside the magnet: href.
// HTML escapes "&" as "&amp;" inside attributes -> normalize before parsing.
function parse1337xDetail(html) {
  var raw = String(html || "").replace(/&amp;/gi, "&");
  if (isCloudflareGate(raw)) return null;
  var m = raw.match(/magnet:\?xt=urn:btih:([0-9a-zA-Z]{32,40})/i);
  if (!m || !validHash(m[1])) return null;
  var trackers = [];
  var trRe = /[-&]tr=([^&"'\s]+)/gi;
  var tm;
  while ((tm = trRe.exec(raw)) !== null) {
    var tr = tm[1];
    try { tr = decodeURIComponent(tr); } catch (e) { /* keep raw */ }
    tr = String(tr).replace(/^tracker:/i, "").trim();
    if (/^(udp|https?):\/\//i.test(tr) && trackers.indexOf(tr) === -1) trackers.push(tr);
    if (trackers.length >= 12) break;
  }
  return { infoHash: m[1], trackers: trackers };
}

function x1337BuildStream(row, detail, ctx) {
  var name = row.name;
  if (isJunk(name)) return null;
  var seeders = row.seeders || 0;
  if (seeders < X1337_MIN_SEEDERS) return null;
  if (!tokenCoverage(normalizeName(name), tokensOf(ctx.title))) return null;
  var filipino = isFilipinoRelease(name);
  if (!ctx.isTagalogOriginal && !filipino && ctx.keepAllLanguages !== true) return null;
  var quality = parseQuality(name);
  var seasonBonus = ctx.isTv ? seasonEpBonus(name, ctx.season, ctx.episode) : 0;
  var magnet = buildMagnet(detail.infoHash, name, detail.trackers, null);
  var stream = {
    name: "1337x 👤" + seeders + " ⏫" + quality,
    title: buildTitle(name, ctx, quality, row.size || "", "1337x", filipino),
    url: magnet,
    quality: quality,
    size: row.size || undefined,
    language: languageLabel(filipino, name, ctx) || undefined,
    seeders: seeders,
    infoHash: detail.infoHash,
    headers: {}
  };
  stream._filipino = filipino;
  stream._score = scoreRelease(
    { filipino: filipino, quality: quality, seeders: seeders, tracker: "1337x", seasonBonus: seasonBonus },
    ctx
  );
  return stream;
}

function x1337Search(query, ctx) {
  var url = X1337_BASE + "/sort-search/" + encodeURIComponent(query) + "/seeders/desc/1/";
  return fetchText(url, X1337_TIMEOUT_MS).then(function (text) {
    return parse1337xList(text);
  }).catch(function (e) {
    console.log("[TagalogTorrents][1337x] search failed: " + (e && e.message));
    return [];
  });
}

function x1337FetchDetails(rows, ctx) {
  var sorted = rows.slice().sort(function (a, b) { return (b.seeders || 0) - (a.seeders || 0); });
  var top = sorted.slice(0, X1337_MAX_DETAILS);
  return Promise.all(top.map(function (row) {
    return fetchText(X1337_BASE + row.href, X1337_TIMEOUT_MS).then(function (html) {
      return parse1337xDetail(html);
    }).catch(function () { return null; }).then(function (detail) {
      return detail ? x1337BuildStream(row, detail, ctx) : null;
    });
  })).then(function (streams) {
    var out = [];
    for (var i = 0; i < streams.length; i++) {
      if (streams[i]) out.push(streams[i]);
    }
    return out;
  });
}

function x1337Lane(ctx) {
  var queries = buildX1337Queries(ctx);
  if (!queries.length) return Promise.resolve([]);
  return x1337Search(queries[0], ctx).then(function (rows) {
    if (rows.length || queries.length < 2) return rows;
    return x1337Search(queries[1], ctx);
  }).then(function (rows) {
    if (!rows.length) return [];
    return x1337FetchDetails(rows, ctx);
  }).catch(function (e) {
    console.log("[TagalogTorrents][1337x] " + (e && e.message));
    return [];
  });
}

// ---------- finalize ----------
function finalize(streams) {
  var byHash = {};
  var out = [];
  (streams || []).forEach(function (s) {
    if (!s || !s.url) return;
    var key = String(s.infoHash || s.url).toLowerCase();
    var prev = byHash[key];
    if (prev) {
      if ((s._score || 0) > (prev._score || 0)) {
        out[out.indexOf(prev)] = s;
        byHash[key] = s;
      }
      return;
    }
    byHash[key] = s;
    out.push(s);
  });
  out.sort(function (a, b) {
    return (b._score || 0) - (a._score || 0);
  });
  return out.slice(0, MAX_STREAMS).map(function (s) {
    var copy = {};
    Object.keys(s).forEach(function (k) {
      if (k.charAt(0) !== "_") copy[k] = s[k];
    });
    return copy;
  });
}

// ---------- entry point ----------
function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var cfg = settings();
    if (cfg.enableTorrents === false) return Promise.resolve([]);
    // v1.2.0: normalize media-type aliases - NuvioTVSmart passes the catalog
    // type verbatim ("series"), which used to classify every episode as a
    // movie lookup and pulled wrong/unmatched torrents.
    var mt = String(mediaType === undefined || mediaType === null ? "" : mediaType).toLowerCase();
    if (mt === "series" || mt === "show" || mt === "tv_show" || mt === "tvshow") mt = "tv";
    var idStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/^tmdb:/i, "").trim();

    var run = function (effectiveId, effectiveType, forcedImdbId) {
      var isTv = effectiveType === "tv";
      return fetchTmdbMeta(effectiveId, effectiveType).then(function (meta) {
        var ctx = {
          isTv: isTv,
          title: meta.title || meta.originalTitle || "",
          originalTitle: meta.originalTitle || meta.title || "",
          year: meta.year,
          imdbId: meta.imdbId || forcedImdbId || null,
          isTagalogOriginal: meta.isTagalogOriginal,
          season: isTv ? (season != null ? parseInt(season, 10) || 1 : 1) : null,
          episode: isTv ? (episode != null ? parseInt(episode, 10) || 1 : 1) : null,
          keepAllLanguages: cfg.keepAllLanguages === true
        };
        var jobs = [];
        if (cfg.torrentioLane !== false) jobs.push(stremioLane("Torrentio", TORRENTIO_API, ctx));
        if (cfg.torrentsdbLane !== false) jobs.push(stremioLane("TorrentsDB", TORRENTSDB_API, ctx));
        if (cfg.tpbLane !== false) jobs.push(withTimeout(apibayLane(ctx), LANE_TIMEOUT_MS * 2 + 2000, "tpb"));
        if (cfg.x1337Lane !== false) jobs.push(withTimeout(x1337Lane(ctx), (X1337_TIMEOUT_MS + 2000) * 3, "1337x"));
        if (!jobs.length) return [];
        return Promise.all(jobs).then(function (results) {
          var merged = [];
          for (var i = 0; i < results.length; i++) merged = merged.concat(results[i] || []);
          return finalize(merged);
        });
      });
    };

    // IMDb tt-id input -> resolve to TMDB for meta; the tt-id doubles as the
    // IMDb key for the Stremio/apibay lanes even if TMDB resolution fails.
    if (/^tt\d+/i.test(idStr)) {
      return resolveImdbToTmdb(idStr).then(function (hit) {
        console.log("[TagalogTorrents] IMDb " + idStr + " -> " + (hit ? ("TMDB " + hit.tmdbId + " (" + hit.type + ")") : "no TMDB hit; using tt-id as IMDb key"));
        return run(hit ? hit.tmdbId : idStr, hit ? hit.type : mt, idStr);
      });
    }

    if (!idStr) return Promise.resolve([]);
    return run(idStr, mt, null);
  } catch (e) {
    return Promise.resolve([]);
  }
}

function onSettings() {
  return Promise.resolve([
    { type: "header", label: "Tagalog Torrents (P2P / debrid)" },
    { type: "toggle", key: "enableTorrents", label: "Enable torrent sources", defaultValue: true },
    { type: "toggle", key: "torrentioLane", label: "Torrentio (IMDb-keyed)", defaultValue: true },
    { type: "toggle", key: "torrentsdbLane", label: "TorrentsDB (IMDb-keyed)", defaultValue: true },
    { type: "toggle", key: "tpbLane", label: "ThePirateBay title search", defaultValue: true },
    { type: "toggle", key: "x1337Lane", label: "1337x (Tagalog-dub search)", defaultValue: true },
    { type: "toggle", key: "keepAllLanguages", label: "Keep non-Tagalog releases too", defaultValue: false }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings, __version: __version };
