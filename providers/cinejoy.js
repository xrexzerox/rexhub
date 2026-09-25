/**
 * cinejoy - Built from src/cinejoy/ (run bun build.js to regenerate)
 *
 * v2.1.0 (device-hardened lanes, 2026-09-14):
 *  Device report: 4.34.0 showed no streams on NuvioMobile while the same
 *  build resolved 6-9 rows from the sandbox. Root cause found by a
 *  Mobile-fidelity sandbox (string-only bridge + per-call latency):
 *  withSharedSubs' two sequential 12s subtitle fetches sat INSIDE the 20s
 *  postfilter tail race - on real mobile networks 14s (WINGS flush) + up to
 *  24s (subs) blew the cap and the tail returned []. Fixes:
 *    - subtitles now race-capped at 3s (subs are garnish, streams are the
 *      product; attachment simply skips on slow networks)
 *    - NEW Lane T3: api.vidlove.cc moviebox2 (the MovieBox backend in the
 *      vidlove ring, 4.32.0-proven shape) - movie+tv, 6.5s cap, so TV rows
 *      do not depend on the WINGS flush alone
 *  v2.0.0 (universal text lanes):
 *  User brought a Playwright reference scraper (github.com/jamilkj18434-boop/
 *  CineJoyScraper) proving cinejoy.to is alive: the site player decrypts via
 *  api.shegu.st/crush.wasm in-browser and POSTs the binary /g leg - exactly
 *  the chain this provider already replicates (re-verified live from Node:
 *  servers 8x ok -> enc-cinejoy -> binary /g 200 -> dec-cinejoy -> real HLS
 *  on info.movieboxnoob.cc). The blocker was never the chain, it is
 *  TRANSPORT: NuvioMobile's fetch bridge moves UTF-8 strings only, so the
 *  binary /g round-trip stays impossible on Mobile without the user's
 *  worker relay. v2.0.0 stops depending on it for basic service:
 *    - NEW Lane T1 (WINGS / api.speedracelight.com): text-only, movie+tv,
 *      live-verified 4 quality rows per title; partial-result collection.
 *    - NEW Lane T2 (MovieBox CDN addon): text-only movies, same CDN family
 *      cinejoy.to itself streams from.
 *    - Native shegu chain kept intact for TV/PC (direct binary works there)
 *      and for Mobile users who configure the cjRelay worker setting
 *      (/cjg + /cjs, asian-catalog bundle v5.7.0+; the bundle shipped in
 *      this pack carries both routes).
 *    - Lanes run in PARALLEL; rows merged + URL-deduped; the provider now
 *      fails only when EVERY lane fails.
 *  The postfilter tail cap is raised 12s -> 20s so the 14s WINGS flush
 *  window survives on slow mobile networks (same treatment videasy got in
 *  4.33.0).
 /**
 * cinejoy - Built from src/cinejoy/ (run bun build.js to regenerate)
 *
 * v3.1.0 (pack 4.44.0, 2026-09-25):
 *  User report: cinejoy shows no streams while cinejoy.pk plays the title
 *  in-browser. Two fixes:
 *    - the player API domain rotated: api.shegu.st /servers answered 502 and
 *      cinejoy.to 301s to cinejoy.pk - both constants re-pointed to
 *      api.wing.st / cinejoy.pk (protocol unchanged: /servers + enc token +
 *      binary POST /g + dec; live-verified from the site's own network trace),
 *      so the native lane works again on TV/PC/node and via cjRelay on Mobile;
 *    - device subs hang: on the QuickJS realm (no timers) withSharedSubs ran
 *      UNCAPPED after rows existed (the 2.5s race only exists where timers
 *      do); dead subtitle hosts rode the call past the app's 60s kill and
 *      zeroed already-extracted rows. On device the subs pass is now skipped
 *      entirely - rows return immediately, subs stay a timers-runtime bonus.
 *
 * v3.0.0 (device-realistic waterfall, 2026-09-14):
 *  Device report: 4.34.0 AND 4.35.0 both showed 0 streams on device while
 *  the same builds resolved 5-9 rows in node. Runtime truth read straight
 *  from the app sources this cycle:
 *    - NuvioMobile PluginRuntime.kt kills the whole provider call at
 *      withTimeout(60s); each fetch is ONE BLOCKING runBlocking host call
 *      (FetchBridge.kt), so "parallel" lanes run sequentially on device.
 *    - The QuickJS runtime (quickjs-kt 1.0.5-nuvio AAR) ships NO timers at
 *      all -> every Promise.race cap/deadline in v2.x was inert on device.
 *    - Request bodies are stringified ("[object Uint8Array]") and responses
 *      are Kotlin strings on BOTH Mobile and TV (NuvioTVSmart
 *      pluginWorker.js: body: String(body)) -> the binary /g leg stays
 *      impossible without the /cjg+/cjs worker relay.
 *    => v2.x device path: native sweep (~12 doomed fetches) + Render addon
 *       cold wake (30-60s blocking) + WINGS fan-out + subs, all sequential
 *       and uncapped -> past the 60s kill -> 0 rows. Sandbox could never
 *       reproduce it (node has timers + real parallelism).
 *  v3.0.0 bounds the provider by FETCH COUNT, not timers, and early-returns
 *  the moment a lane produces rows (typical success path 2-4 fetches):
 *    S1  WINGS (api.speedracelight.com) one server at a time:
 *        cdn -> m4uhd -> lamovie; TMDB meta + /seed cached per title
 *    S2  vidlove moviebox2 (api.vidlove.cc, movie+tv, 1 fetch)
 *    S3  native shegu chain (crush.wasm protocol, movieboxnoob.cc 4K) -
 *        ONLY when it can work: cjRelay configured (worker /cjg+/cjs
 *        relay, works on device) or node-class runtime (tests).
 *        Device without relay: skipped entirely (0 fetches; was ~12 doomed).
 *  REMOVED in v3.0.0: the onrender MovieBox addon lane - a cold Render
 *  wake blocks the device bridge 30-60s on a single fetch and can solo-
 *  kill the whole call; WINGS/vidlove cover the same CDN family.
 *  v2.x history: v2.0.0 hybrid re-added cinejoy (user reference repo
 *  jamilkkj18434-boop/CineJoyScraper; chain re-verified live from Node:
 *  servers 8x ok -> enc-cinejoy -> binary /g 200 -> dec-cinejoy -> real
 *  HLS on *.movieboxnoob.cc). v2.1.0 race-capped subs + merge deadline.
 *  Settings: cjRelay (worker base URL) + wyzieKey unchanged.
 */var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/_shared/constants.js
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var MULTI_DECRYPT_API = "https://enc-dec.app/api";
// v3.1.0: the site moved - cinejoy.to now 301s to cinejoy.pk and the player
// API moved api.shegu.st -> api.wing.st (same protocol: /servers, crush.wasm,
// binary POST /g; live-verified 2026-09-25 from the real site's network trace:
// api.wing.st/info -> imdb.wing.st/tt... -> api.wing.st/servers -> POST /g 200
// -> ok.*.cc master.m3u8). The old host answered 502 on /servers, which zeroed
// the native lane for everyone ("cinejoy doesnt show stream even its
// available in the website").
var CINEJOY_API = "https://api.wing.st";
var CINEJOY_BASE = "https://cinejoy.pk";
var WYZIE_API = "https://sub.wyzie.io";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// src/_shared/tmdb.js
var metaCache = {};
function fetchTmdbMeta(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    const cacheKey = type + ":" + tmdbId;
    if (metaCache[cacheKey])
      return metaCache[cacheKey];
    const url = TMDB_BASE_URL + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";
    try {
      const res = yield fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" }
      });
      if (!res.ok)
        throw new Error("TMDB HTTP " + res.status);
      const data = yield res.json();
      const title = type === "movie" ? data.title || data.original_title || "" : data.name || data.original_name || "";
      const originalTitle = data.original_title || data.original_name || title;
      const date = data.release_date || data.first_air_date || "";
      const imdbId = data.external_ids && data.external_ids.imdb_id || null;
      const meta = {
        title,
        originalTitle,
        year: date ? parseInt(String(date).substring(0, 4), 10) || null : null,
        imdbId,
        tmdbId: parseInt(tmdbId, 10) || null,
        countries: (data.production_countries || []).map(function(c) {
          return c && (c.name || c.iso_3166_1);
        }).filter(Boolean)
      };
      metaCache[cacheKey] = meta;
      return meta;
    } catch (e) {
      console.log("[Streamline][tmdb] " + e.message);
      return { title: "", originalTitle: "", year: null, imdbId: null, tmdbId: null, countries: [] };
    }
  });
}
function buildCtx(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const isTv = mediaType === "tv";
    const meta = yield fetchTmdbMeta(String(tmdbId), mediaType);
    const countries = meta.countries || [];
    return {
      tmdbId: meta.tmdbId || parseInt(tmdbId, 10) || null,
      imdbId: meta.imdbId,
      title: meta.title,
      originalTitle: meta.originalTitle,
      year: meta.year,
      season: season != null ? season : 1,
      episode: episode != null ? episode : 1,
      isTv,
      isBollywood: countries.some(function(c) {
        return /india|\bIN\b/i.test(String(c));
      })
    };
  });
}

// src/_shared/utils.js
function defaultHeaders(extra) {
  return Object.assign({ "User-Agent": UA, "Accept": "*/*" }, extra || {});
}
function hasTimers() {
  try {
    return typeof setTimeout === "function" && typeof clearTimeout === "function";
  } catch (e) {
    return false;
  }
}
function fetchWithTimeout(url, options, timeoutMs) {
  return __async(this, null, function* () {
    if (!hasTimers()) {
      return fetch(url, options || {});
    }
    const timeout = timeoutMs || 2e4;
    let timer = null;
    try {
      const fetchPromise = fetch(url, options || {});
      const timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
          reject(new Error("timeout after " + timeout + "ms: " + url));
        }, timeout);
      });
      const res = yield Promise.race([fetchPromise, timeoutPromise]);
      if (timer)
        clearTimeout(timer);
      return res;
    } catch (e) {
      if (timer)
        clearTimeout(timer);
      throw e;
    }
  });
}
function fetchText(url, headers, timeoutMs) {
  return __async(this, null, function* () {
    const res = yield fetchWithTimeout(url, { headers: defaultHeaders(headers) }, timeoutMs);
    if (!res.ok)
      throw new Error("HTTP " + res.status + " for " + url);
    return yield res.text();
  });
}
function postJson(url, body, headers, timeoutMs) {
  return __async(this, null, function* () {
    const res = yield fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: defaultHeaders(
          Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, headers || {})
        ),
        body: typeof body === "string" ? body : JSON.stringify(body == null ? {} : body)
      },
      timeoutMs
    );
    if (!res.ok)
      throw new Error("HTTP " + res.status + " for " + url);
    const text = yield res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  });
}
function parseQuality(raw) {
  if (raw == null)
    return "Auto";
  const s = String(raw).toLowerCase().replace(/4khdhub|uhdmovies|vegamovies|moviesmod|moviesdrive|bollyflix|hubcloud|vcloud|pixeldrain|gofile/g, " ");
  const m = s.match(/(\d{3,4})\s*p/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 4e3)
      return "8K";
    if (n >= 1e3)
      return "1080p";
    if (n >= 700)
      return "720p";
    if (n >= 400)
      return "480p";
    if (n > 0)
      return "360p";
  }
  if (/\b8k\b/.test(s))
    return "8K";
  if (/2160|4k|uhd/.test(s))
    return "4K";
  if (/org/.test(s))
    return "4K";
  if (/cam|ts|telesync|telecine|hdcam/.test(s))
    return "CAM";
  if (/hd/.test(s))
    return "720p";
  return "Auto";
}
function makeStream(source, title, url, quality, headers, subtitles, extra) {
  if (!url)
    return null;
  const u = String(url);
  if (u.indexOf("http") !== 0 && u.indexOf("magnet:?") !== 0)
    return null;
  const stream = {
    name: source,
    title: title || source,
    url: u,
    quality: quality || parseQuality(title),
    headers: headers || {},
    subtitles: subtitles || []
  };
  if (extra) {
    Object.keys(extra).forEach(function(k) {
      if (extra[k] !== void 0 && extra[k] !== null && extra[k] !== "")
        stream[k] = extra[k];
    });
  }
  return stream;
}
function withTimeout(promise, ms, label) {
  if (!hasTimers())
    return promise;
  const timeout = ms || 25e3;
  let timer = null;
  return Promise.race([
    promise,
    new Promise(function(resolve) {
      timer = setTimeout(function() {
        console.log("[Streamline] timeout: " + label);
        resolve([]);
      }, timeout);
    })
  ]).then(function(v) {
    // v1.6.0: clear the losing timer so resolved calls stop logging a
    // bogus "timeout" seconds later (stray timers are device-hostile).
    if (timer) clearTimeout(timer);
    return v;
  }, function(e) {
    if (timer) clearTimeout(timer);
    throw e;
  });
}
function dedupe(streams) {
  const seen = {};
  const out = [];
  (streams || []).forEach(function(s) {
    if (!s || !s.url || seen[s.url])
      return;
    seen[s.url] = true;
    out.push(s);
  });
  return out;
}

// src/_shared/meta.js
function qualityEmoji(quality) {
  const q = String(quality || "");
  if (/4K|2160/i.test(q))
    return "\u{1F525}";
  if (/1080/i.test(q))
    return "\u{1F48E}";
  if (/720/i.test(q))
    return "\u26A1";
  if (/480/i.test(q))
    return "\u{1F4F1}";
  if (/CAM|TS|TC/i.test(q))
    return "\u{1F3A5}";
  return "\u{1F3AC}";
}
function qualityRank(quality) {
  const q = String(quality || "").toLowerCase();
  if (/8k|4320/.test(q))
    return 5;
  if (/4k|2160/.test(q))
    return 4;
  if (/1080|fhd/.test(q))
    return 3;
  if (/720|hd/.test(q))
    return 2;
  if (/480|sd/.test(q))
    return 1;
  return 0;
}
function firstMatch(text, re) {
  const m = String(text || "").match(re);
  return m ? m[0] : null;
}
var SITE_TAGS = /4khdhub|uhdmovies|vegamovies|moviesmod|moviesdrive|bollyflix|rogmovies|topmovies|hubcloud|vcloud|hubdrive|pixeldrain|gofile|driveleech|driveseed|fastdlserver|linksmod|moviemod|hdhub4u|movies4u|dudefilms|mlsbd|multimovies|skymovies|rtally|toonstream/gi;
function parseMeta(raw) {
  const cleaned = String(raw || "").replace(SITE_TAGS, " ");
  const noUrl = cleaned.replace(/https?:\/\/\S+/g, " ");
  const text = cleaned;
  const meta = {
    quality: "Auto",
    rank: 0,
    size: "",
    sizeMB: 0,
    hdr: "",
    codec: "",
    dv: false,
    audio: "",
    atmos: false,
    lang: "",
    source: "",
    container: ""
  };
  const qm = text.match(/(\d{3,4})\s*p/i);
  if (qm) {
    const n = parseInt(qm[1], 10);
    meta.quality = n >= 2e3 ? n >= 4e3 ? "8K" : "4K" : n >= 1e3 ? "1080p" : n >= 700 ? "720p" : n >= 400 ? "480p" : "360p";
    if (n >= 8e3)
      meta.quality = "8K";
  } else if (/\b8k\b/i.test(text))
    meta.quality = "8K";
  else if (/2160|4k|uhd/i.test(text))
    meta.quality = "4K";
  else if (/cam|hdcam|telesync|telecine|\bts\b|\btc\b|scr|dvdscr/i.test(text))
    meta.quality = "CAM";
  else if (/\bhd\b/i.test(text))
    meta.quality = "720p";
  meta.rank = qualityRank(meta.quality);
  let sm = noUrl.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i) || text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (sm) {
    meta.size = parseFloat(sm[1]).toFixed(sm[2].toUpperCase() === "GB" && sm[1].indexOf(".") === -1 ? 0 : 2).replace(/\.00$/, "") + " " + sm[2].toUpperCase();
    meta.sizeMB = Math.round(parseFloat(sm[1]) * (sm[2].toUpperCase() === "GB" ? 1024 : 1));
  }
  if (/\bdolby[\s-]*vision\b|dovi/i.test(text) || /[.\-_]dv[.\-_]/i.test(text)) {
    meta.dv = true;
    meta.hdr = "DV";
  } else if (/hdr10\+/i.test(text))
    meta.hdr = "HDR10+";
  else if (/hdr10/i.test(text))
    meta.hdr = "HDR10";
  else if (/\bhlg\b/i.test(text))
    meta.hdr = "HLG";
  else if (/\bhdr\b/i.test(text))
    meta.hdr = "HDR";
  else if (/\bsdr\b/i.test(text))
    meta.hdr = "SDR";
  if (/\bav1\b/i.test(text))
    meta.codec = "AV1";
  else if (/\b(h\.?265|x265|hevc)\b/i.test(text))
    meta.codec = "H.265";
  else if (/\b(h\.?264|x264|avc)\b/i.test(text))
    meta.codec = "H.264";
  else if (/\bvp9\b/i.test(text))
    meta.codec = "VP9";
  else if (/\bxvid\b/i.test(text))
    meta.codec = "XviD";
  else if (/\bdivx\b/i.test(text))
    meta.codec = "DivX";
  if (/truehd[\s.]*7\.1|truehd.*atmos/i.test(text))
    meta.audio = "TrueHD 7.1";
  else if (/atmos/i.test(text))
    meta.atmos = true;
  if (!meta.audio) {
    if (/\bddp[\s.]*5\.1\b|eac3|dd\+[\s.]*5\.1/i.test(text))
      meta.audio = "DDP5.1";
    else if (/\bdd5\.1\b|ac3[\s.]*5\.1|dolby[\s.]*digital[\s.]*5\.1/i.test(text))
      meta.audio = "DD5.1";
    else if (/\bac3\b|dolby[\s.]*digital/i.test(text))
      meta.audio = "DD";
    else if (/dts[\s-]*hd[\s.]*ma|dts[\s.]*x/i.test(text))
      meta.audio = "DTS-HD MA";
    else if (/\bdts\b/i.test(text))
      meta.audio = "DTS";
    else if (/\b7\.1\b/i.test(text))
      meta.audio = "7.1";
    else if (/\b5\.1\b/i.test(text))
      meta.audio = "5.1";
    else if (/\baac\b/i.test(text))
      meta.audio = "AAC";
    else if (/\bopus\b/i.test(text))
      meta.audio = "Opus";
    else if (/\bmp3\b/i.test(text))
      meta.audio = "MP3";
  }
  if (/atmos/i.test(text))
    meta.atmos = true;
  const langs = [];
  function has() {
    for (let i = 0; i < arguments.length; i++) {
      if (new RegExp("\\b" + arguments[i] + "\\b", "i").test(text))
        return true;
    }
    return false;
  }
  if (/multi[\s._-]*audio/i.test(text))
    langs.push("Multi-Audio");
  else if (/dual[\s._-]*audio/i.test(text))
    langs.push("Dual-Audio");
  if (/\btagalog\b|\bfilipino\b|\btl\b/i.test(text))
    langs.push("Tagalog");
  if (has("english", "eng"))
    langs.push("English");
  if (/esub/i.test(text))
    langs.push("ESub");
  meta.lang = langs.slice(0, 3).join(" + ");
  if (/remux/i.test(text))
    meta.source = "REMUX";
  else if (/bluray|blu[\s._-]*ray|brrip|bdrip/i.test(text))
    meta.source = "BluRay";
  else if (/web[\s._-]*dl/i.test(text))
    meta.source = "WEB-DL";
  else if (/webrip|web[\s._-]*rip/i.test(text))
    meta.source = "WEBRip";
  else if (/hdrip/i.test(text))
    meta.source = "HDRip";
  else if (/hdtv/i.test(text))
    meta.source = "HDTV";
  else if (/pdtv|sdtv|tvrip/i.test(text))
    meta.source = "TVRip";
  else if (/dvdrip|dvdscr/i.test(text))
    meta.source = "DVDRip";
  else if (/\bdvd\b/i.test(text))
    meta.source = "DVD";
  else if (/cam|hdcam|telesync|telecine|\bts\b|\btc\b|\bscr\b/i.test(text))
    meta.source = "CAM";
  if (/\.m3u8/i.test(text) || firstMatch(text, /hls/i))
    meta.container = "HLS";
  else if (/\.mpd/i.test(text) || /\bdash\b/i.test(text))
    meta.container = "DASH";
  else if (/\.mp4/i.test(text))
    meta.container = "MP4";
  else if (/\.mkv/i.test(text))
    meta.container = "MKV";
  return meta;
}
function headline(title, year, seasonEp) {
  const t = String(title || "Unknown").trim();
  if (seasonEp)
    return "\u{1F3AC} " + t + " - (" + seasonEp + ")";
  if (year)
    return "\u{1F3AC} " + t + " (" + year + ")";
  return "\u{1F3AC} " + t;
}
function seasonEpCode(season, episode) {
  if (season == null || episode == null)
    return "";
  return "S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(2, "0");
}
function richTitle(provider, line1, meta, container) {
  const lines = [line1];
  const l2 = qualityEmoji(meta.quality) + " " + meta.quality + (meta.size ? " \u2022 " + meta.size : "") + " | \u{1F4FC} " + (container || meta.container || "VIDEO");
  lines.push(l2);
  const l3parts = [];
  if (meta.hdr)
    l3parts.push("\u{1F308} " + meta.hdr);
  if (meta.codec)
    l3parts.push("\u{1F39E} " + meta.codec);
  if (meta.dv && meta.hdr !== "DV")
    l3parts.push("\u{1F441}\uFE0F DV");
  if (l3parts.length)
    lines.push(l3parts.join(" \u2022 "));
  const l4parts = [];
  if (meta.lang)
    l4parts.push("\u{1F30D} " + meta.lang);
  if (meta.audio || meta.atmos) {
    l4parts.push("\u{1F3A7} " + (meta.audio || "Audio") + (meta.atmos ? " +Atmos" : ""));
  }
  if (l4parts.length)
    lines.push(l4parts.join(" | "));
  if (meta.source)
    lines.push("\u{1F4BF} " + meta.source);
  return { text: lines.join("\n"), providerTag: provider + " | " + meta.quality };
}
function richName(provider, meta) {
  const bits = [meta.quality];
  if (meta.audio)
    bits.push(meta.audio + (meta.atmos ? "+Atmos" : ""));
  else if (meta.lang)
    bits.push(meta.lang);
  return provider + " | " + bits.join(" \u2022 ");
}
function enrichStream(stream, raw, line1) {
  if (!stream || stream._rich)
    return stream;
  const meta = parseMeta((raw || "") + " " + (stream.url || ""));
  const rt = richTitle(stream.name, line1 || stream.title, meta);
  const copy = Object.assign({}, stream);
  copy.name = richName(stream.name, meta);
  copy.title = rt.text;
  copy.quality = meta.quality === "Auto" ? stream.quality || "Auto" : meta.quality;
  if (meta.size)
    copy.size = meta.size;
  if (meta.lang && !copy.language)
    copy.language = meta.lang.split(" + ")[0];
  copy._rank = meta.rank;
  copy._sizeMB = meta.sizeMB;
  copy._rich = true;
  return copy;
}
function presentStreams(streams, ctx) {
  const line1 = ctx && (ctx.title || ctx.originalTitle) ? headline(
    ctx.originalTitle || ctx.title,
    ctx.isTv ? null : ctx.year,
    ctx.isTv ? seasonEpCode(ctx.season, ctx.episode) : ""
  ) : null;
  const enriched = (streams || []).map(function(s) {
    if (!s || s._rich)
      return s;
    return enrichStream(s, (s.title || "") + " " + (s.quality || ""), line1 || s.title);
  });
  enriched.sort(function(a, b) {
    const r = (b._rank || 0) - (a._rank || 0);
    if (r !== 0)
      return r;
    return (b._sizeMB || 0) - (a._sizeMB || 0);
  });
  return enriched.map(function(s) {
    if (!s)
      return s;
    const copy = Object.assign({}, s);
    delete copy._rank;
    delete copy._sizeMB;
    delete copy._rich;
    return copy;
  });
}

// src/_shared/subs.js
var STREMIO_SUBS = [
  "https://opensubtitles.stremio.homes/en|tl/ai-translated=true|from=all|auto-adjustment=true",
  'https://subsense.nepiraw.com/n0tcjfba-{"languages":["en","tl"],"maxSubtitles":10}'
];
function settings() {
  try {
    return globalThis.SCRAPER_SETTINGS || {};
  } catch (e) {
    return {};
  }
}
function stremioSubtitles(imdbId, season, episode, isTv) {
  return __async(this, null, function* () {
    const out = [];
    if (!imdbId)
      return out;
    const path = isTv ? "/subtitles/series/" + imdbId + ":" + season + ":" + episode + ".json" : "/subtitles/movie/" + imdbId + ".json";
    const jobs = STREMIO_SUBS.map(function(base) {
      return function() {
        return __async(this, null, function* () {
          try {
            const json = JSON.parse(yield fetchText(base + path, {}, 12e3));
            const list = json && json.subtitles || [];
            list.slice(0, 12).forEach(function(s) {
              if (!s || !s.url)
                return;
              out.push({
                url: s.url,
                language: s.lang || s.lang_code || "en",
                name: (s.title || s.lang || "Subtitle") + " [Stremio]"
              });
            });
          } catch (e) {
            console.log("[Streamline][subs] " + base + ": " + e.message);
          }
        });
      }();
    });
    yield Promise.all(jobs);
    return out;
  });
}
function wyzieSubtitles(imdbId, season, episode, isTv) {
  return __async(this, null, function* () {
    const key = settings().wyzieKey;
    if (!key || !imdbId)
      return [];
    const url = isTv ? WYZIE_API + "/search?id=" + imdbId + "&season=" + season + "&episode=" + episode + "&source=all&key=" + key : WYZIE_API + "/search?id=" + imdbId + "&source=all&key=" + key;
    try {
      const list = JSON.parse(yield fetchText(url, {}, 12e3));
      return (Array.isArray(list) ? list : []).slice(0, 12).map(function(s) {
        return {
          url: s.url,
          language: s.language || "en",
          name: (s.display || s.language || "Subtitle") + " [Wyzie]"
        };
      });
    } catch (e) {
      console.log("[Streamline][wyzie] " + e.message);
      return [];
    }
  });
}
function attachSubtitles(streams, subtitles) {
  if (!subtitles || !subtitles.length)
    return streams;
  return streams.map(function(s) {
    if (s.subtitles && s.subtitles.length)
      return s;
    const copy = Object.assign({}, s);
    copy.subtitles = subtitles.slice(0, 8);
    return copy;
  });
}
function withSharedSubs(streams, ctx) {
  return __async(this, null, function* () {
    try {
      if (!ctx || !ctx.imdbId)
        return streams;
      // v3.0.0: one subs source at a time (each is a blocking device fetch)
      let subs = [];
      try {
        subs = (yield stremioSubtitles(ctx.imdbId, ctx.season, ctx.episode, ctx.isTv)) || [];
      } catch (e1) {
        subs = [];
      }
      if (!subs.length) {
        try { subs = (yield wyzieSubtitles(ctx.imdbId, ctx.season, ctx.episode, ctx.isTv)) || []; } catch (e2) { subs = []; }
      }
      return attachSubtitles(streams, subs);
    } catch (e) {
      return streams;
    }
  });
}
function wyzieKeyField() {
  return {
    type: "text",
    key: "wyzieKey",
    label: "Wyzie subtitles key",
    placeholder: "Optional Wyzie API key",
    description: "Extra subtitles alongside the built-in Stremio ones."
  };
}

// src/_shared/sources/cinejoy.js
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// v1.5.0 FIX: the old decoder ran every 4-char group through B64.indexOf and
// masked with & 63, so '=' padding (-1 -> 63) injected garbage tail bytes
// into every token whose length % 3 != 0 (184-byte live token -> 186 bytes ->
// shegu /g 404). That silently broke BOTH transports for most titles - the
// real "cinejoy never gives stream" root cause on top of the Mobile gap.
// Padding is now stripped and only full groups decode, with the remainder
// handled bit-exact (2 chars -> 1 byte, 3 chars -> 2 bytes).
function b64urlDecodeToBytes(s) {
  const std = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const out = [];
  const n = std.length;
  let i = 0;
  for (; i + 4 <= n; i += 4) {
    const v = B64.indexOf(std[i]) << 18 | B64.indexOf(std[i + 1]) << 12 | B64.indexOf(std[i + 2]) << 6 | B64.indexOf(std[i + 3]);
    out.push(v >> 16 & 255, v >> 8 & 255, v & 255);
  }
  const rem = n - i;
  if (rem === 2) {
    const v = B64.indexOf(std[i]) << 18 | B64.indexOf(std[i + 1]) << 12;
    out.push(v >> 16 & 255);
  } else if (rem === 3) {
    const v = B64.indexOf(std[i]) << 18 | B64.indexOf(std[i + 1]) << 12 | B64.indexOf(std[i + 2]) << 6;
    out.push(v >> 16 & 255, v >> 8 & 255);
  }
  return out;
}
function b64urlEncodeNoPad(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = a << 16 | b << 8 | c;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63];
    out += i + 1 < bytes.length ? B64[n >> 6 & 63] : "";
    out += i + 2 < bytes.length ? B64[n & 63] : "";
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
// src/cinejoy/relay.js (v1.5.0)
var __CJ_G = (typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : this);
var __cjLane = __CJ_G.__CINEJOY_G_LANE__ || (__CJ_G.__CINEJOY_G_LANE__ = { mode: "" }); // "" | "direct" | "relay" | "none"
// v1.6.0: top-level lane memo ("" | "chain" | "full") - skips the doomed
// chain attempts on Mobile after the full worker lane won once.
var __cjTop = __CJ_G.__CINEJOY_TOP_LANE__ || (__CJ_G.__CINEJOY_TOP_LANE__ = { mode: "" });
function relayBase() {
  try {
    var s = (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || (typeof global !== "undefined" && global.SCRAPER_SETTINGS) || {};
    var r = String(s.cjRelay || "").trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(r) ? r : "";
  } catch (e) {
    return "";
  }
}
function readGBytes(res) {
  if (res.arrayBuffer) {
    return res.arrayBuffer().then(function(ab) {
      const u8 = new Uint8Array(ab);
      const out = [];
      for (let i = 0; i < u8.length; i++) out.push(u8[i] & 255);
      return out;
    });
  }
  return res.text().then(function(t) {
    const out = [];
    for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i) & 255);
    return out;
  });
}
function gLaneDirectBytes(bodyBytes, headers) {
  return fetch(CINEJOY_API + "/g", {
    method: "POST",
    headers: Object.assign({}, headers, { "Content-Type": "application/octet-stream", Origin: CINEJOY_BASE }),
    body: bodyBytes
  }).then(function(res) {
    if (!res || !res.ok) throw new Error("g HTTP " + (res ? res.status : "?"));
    return readGBytes(res);
  }).then(function(bytes) {
    __cjLane.mode = "direct";
    return bytes;
  });
}
function gLaneDirectString(bodyBytes, headers) {
  let binBody = "";
  for (let i = 0; i < bodyBytes.length; i++) binBody += String.fromCharCode(bodyBytes[i] & 255);
  return fetch(CINEJOY_API + "/g", {
    method: "POST",
    headers: Object.assign({}, headers, { "Content-Type": "application/octet-stream", Origin: CINEJOY_BASE }),
    body: binBody
  }).then(function(res) {
    if (!res || !res.ok) throw new Error("g HTTP " + (res ? res.status : "?"));
    return readGBytes(res);
  }).then(function(bytes) {
    __cjLane.mode = "direct";
    return bytes;
  });
}
function gLaneRelay(bodyBytes) {
  const base = relayBase();
  if (!base) return Promise.reject(new Error("no relay configured"));
  return fetch(base + "/cjg", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: b64urlEncodeNoPad(bodyBytes)
  }).then(function(res) {
    if (!res || !res.ok) throw new Error("relay HTTP " + (res ? res.status : "?"));
    return res.json();
  }).then(function(j) {
    const packed = (j && (j.b64 || (j.result && j.result.b64))) || "";
    if (!j || !j.ok || !packed) throw new Error("relay payload");
    const bytes = b64urlDecodeToBytes(packed);
    const out = [];
    for (let i = 0; i < bytes.length; i++) out.push(bytes[i] & 255);
    return out;
  }).then(function(bytes) {
    __cjLane.mode = "relay";
    return bytes;
  });
}
/**
 * POST the encrypted request token to shegu /g, return raw response bytes
 * (plain array) or null when every configured lane fails. Lane order honors
 * the memo so Mobile skips its doomed direct attempts after the first server.
 */
function gRequest(bodyBytes, headers) {
  // v1.7.0: "none" = both direct lanes proved dead AND no relay configured -
  // every further /g call is a guaranteed failure, skip it entirely.
  if (__cjLane.mode === "none") return Promise.resolve(null);
  const lanes = __cjLane.mode === "relay"
    ? [gLaneRelay]
    : [gLaneDirectBytes, gLaneDirectString, gLaneRelay];
  let chain = Promise.reject(new Error("start"));
  lanes.forEach(function(lane) {
    chain = chain.catch(function() {
      return lane(bodyBytes, headers);
    });
  });
  return chain.catch(function() {
    // v1.7.0: first server proves the runtime cannot reach /g directly and
    // no relay is configured -> stop repeating the doomed attempts.
    if (!__cjLane.mode && !relayBase()) {
      __cjLane.mode = "none";
      console.log("[Streamline][cinejoy] binary /g unreachable on this runtime and no relay configured - further server attempts skipped");
    }
    return null;
  });
}

function enabled() {
  try {
    const s = globalThis.SCRAPER_SETTINGS || {};
    return s.cinejoy !== false;
  } catch (e) {
    return true;
  }
}
/** Shared row builder from a dec/full-lane stream list. */
function rowsFromStreams(streams, name) {
  const out = [];
  const list = Array.isArray(streams) ? streams : [streams];
  list.forEach(function(st) {
    if (!st)
      return;
    if (st.playlist) {
      const s = makeStream("Cinejoy", "Cinejoy - " + (st.id || name) + " [HLS]", st.playlist, "1080p", { Referer: CINEJOY_BASE + "/" }, []);
      if (s)
        out.push(s);
    }
    const quals = st.qualities || st.files || {};
    Object.keys(quals).forEach(function(k) {
      const u = quals[k];
      if (!u || String(u).indexOf("https") !== 0)
        return;
      const s = makeStream("Cinejoy", "Cinejoy - " + (st.id || name) + " " + k, u, parseQuality(k), { Referer: CINEJOY_BASE + "/" }, []);
      if (s)
        out.push(s);
    });
  });
  return out;
}

/**
 * v1.6.0: full-chain worker lane. ONE text POST to the asian-catalog worker
 * (/cjs, v5.7.0+) which runs the entire cinejoy chain server-side and returns
 * final stream JSON. The device never touches a binary body nor enc-dec.app.
 */
function scrapeServerFull(srv, ctx, type) {
  const base = relayBase();
  if (!base)
    return Promise.resolve([]);
  const name = srv && srv.name || srv;
  const body = JSON.stringify({
    title: ctx.title || "",
    type: type,
    year: ctx.year || "",
    imdb: ctx.imdbId || "",
    tmdb: ctx.tmdbId || "",
    server: String(name || ""),
    season: ctx.isTv ? (ctx.season || 1) : 0,
    episode: ctx.isTv ? (ctx.episode || 1) : 0
  });
  return fetch(base + "/cjs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body
  }).then(function(res) {
    if (!res || !res.ok)
      throw new Error("full HTTP " + (res ? res.status : "?"));
    return res.json();
  }).then(function(j) {
    if (!j || !j.ok)
      return [];
    return rowsFromStreams(j.streams || [], name);
  });
}

function scrapeServer(srv, ctx, headers, type) {
  return __async(this, null, function* () {
    // v1.6.0: per-server chain lane (below) + full-chain worker fallback,
    // memoized in __CINEJOY_TOP_LANE__ ("chain" | "full") so Mobile skips the
    // doomed direct attempts after the first server.
    const name = srv && srv.name || srv;
    if (__cjTop.mode === "full") {
      return scrapeServerFull(srv, ctx, type).catch(function() { return []; });
    }
    let rows = [];
    try {
      rows = yield scrapeServerChain(srv, ctx, headers, type);
    } catch (e) {
      rows = [];
    }
    if (rows.length) {
      __cjTop.mode = "chain";
      return rows;
    }
    if (relayBase()) {
      try {
        const full = yield scrapeServerFull(srv, ctx, type);
        if (full.length)
          __cjTop.mode = "full";
        return full;
      } catch (e2) {
        return [];
      }
    }
    return rows;
  });
}

function scrapeServerChain(srv, ctx, headers, type) {
  return __async(this, null, function* () {
    // v1.5.0: one server lane, isolated (any failure -> []). Extracted from
    // scrape() so servers can run in PARALLEL waves - the sequential loop
    // blew getStreams' 20s budget (enc/g/dec at 3-5s per server x 6) and
    // returned zero rows on slow networks - the device's other "never
    // streams" symptom.
    const out = [];
    try {
      const isTv = ctx.isTv;
      const name = srv && srv.name || srv;
      let target = CINEJOY_API + "/?title=" + encodeURIComponent(ctx.title) + "&type=" + type + "&year=" + (ctx.year || "") + "&imdb=" + (ctx.imdbId || "") + "&tmdb=" + (ctx.tmdbId || "") + "&server=" + encodeURIComponent(name);
      if (isTv)
        target += "&season=" + ctx.season + "&episode=" + ctx.episode;
      const encJson = JSON.parse(
        yield fetchText(MULTI_DECRYPT_API + "/enc-cinejoy?url=" + encodeURIComponent(target), {}, 15e3)
      );
      const result = encJson && encJson.result || encJson;
      if (!result || !result.data)
        return out;
      const bodyBytes = b64urlDecodeToBytes(result.data);
      // v1.5.0: the request/response bodies are BINARY. gRequest runs the
      // direct octet-stream lanes (Node/CF/TVSmart) and, when the runtime
      // cannot send binary at all (NuvioMobile's string bridge), the
      // base64url text relay on the user's asian-catalog worker (/cjg).
      // Each lane is memoized in __CINEJOY_G_LANE__ after the first hit.
      let gBody = bodyBytes;
      if (!(typeof Uint8Array !== "undefined" && bodyBytes instanceof Uint8Array)) {
        gBody = new Uint8Array(bodyBytes.length);
        for (let i = 0; i < bodyBytes.length; i++) gBody[i] = bodyBytes[i] & 255;
      }
      const gBuf = yield gRequest(gBody, headers);
      if (!gBuf)
        return out;
      const payload = b64urlEncodeNoPad(gBuf);
      const decJson = yield postJson(
        MULTI_DECRYPT_API + "/dec-cinejoy",
        { text: payload, state: result.state },
        {},
        15e3
      );
      const streams = ((decJson && decJson.result || {}).data || {}).stream;
      if (!streams)
        return out;
      rowsFromStreams(streams, name).forEach(function(s) { out.push(s); });
    } catch (e) {
      return out;
    }
    return out;
  });
}

/* ===== nv-plugins universal text lanes v2.0.0 (pack 4.36.0, 2026-09-14) ====
   ZERO-CONFIG TEXT lanes that work on EVERY Nuvio runtime (Mobile and TV
   included - both bridges move strings only and the QuickJS runtime ships
   no timers, so the waterfall below is bounded by FETCH COUNT, not caps):
     Lane T1  WINGS  (api.speedracelight.com, the vidking backend) - movie+tv,
             ported from the 4.33.0-verified wings lane (mvm1 keystream,
             partial-result collection so a hung server can never zero it),
             now called ONE SERVER AT A TIME with meta+seed cached per title
     Lane T2  vidlove moviebox2 (api.vidlove.cc) - movie+tv, 1 fetch
   The native shegu chain (8 servers, enc-dec, binary /g, worker /cjg+/cjs
   relay) is the LAST waterfall stage and only runs where it can work:
   cjRelay configured on device, or node-class runtimes (tests). The onrender
   MovieBox addon lane was REMOVED in 4.36.0 - a cold Render wake blocks the
   device bridge 30-60s on a single fetch and can solo-kill the call.
   ========================================================================= */
/* ============================================================
 * nv-plugins WINGS lane v1.0.0 (pack 4.33.0, 2026-09-13)
 * ------------------------------------------------------------
 * Self-contained extraction lane for the vidking/speedracelight
 * backend (same backend the VidEasy/Cineby providers use), ported
 * from the verified cineby.js decryptor and videasy.js request
 * shapes. Live-verified 2026-09-13: Fight Club (movie) 3 rows,
 * Breaking Bad S1E1 (tv) rows, m3u8 payloads return 200 real HLS.
 *
 * Exposes one function: __nvWingsStreams(opts)
 *   opts = { tmdbId, mediaType, season, episode, label, timeoutMs }
 * Returns a Promise<rows[]>; NEVER rejects, NEVER throws.
 * Uses __nvFetch when present, else global fetch.
 * Pure JS: no URLSearchParams, no AbortController, no node APIs.
 * ============================================================ */
(function () {
  'use strict';

  var WINGS_BASE = 'https://api.speedracelight.com';
  var TMDB_KEY = '439c478a771f35c05022f9feabcca01c';
  var WINGS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  var WINGS_HEADERS = {
    'User-Agent': WINGS_UA,
    'Accept': '*/*',
    'Origin': 'https://www.vidking.net',
    'Referer': 'https://www.vidking.net/',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  var WINGS_SERVERS = ['cdn/sources-with-title', 'm4uhd/sources-with-title', 'lamovie/sources-with-title'];
  var MAGIC = [0x6d, 0x76, 0x6d, 0x31]; /* "mvm1" */
  var SHA_C = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
               0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174];

  function _f(x) {
    x = x >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x;
  }
  function _rotl(x, n) {
    x = x >>> 0; n = n & 31;
    if (n === 0) return x >>> 0;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }
  function _branch(n) { return ((n * (n + 1)) & 1) === 0; }
  function _fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x1000193) >>> 0;
    return _f(h);
  }
  function _makeState(seed, mediaId) {
    var slots = new Array(61);
    var s = _f(_fnv(seed) ^ _f(((mediaId >>> 0) ^ 0x9e3779b9) >>> 0)) >>> 0;
    for (var i = 0; i < 8; i++) {
      if (_branch(i)) {
        var idx = s % 61;
        s = _rotl((s + 0x9e3779b9) >>> 0, 7 + (i & 7));
        slots[idx] = (s ^ _f(s)) >>> 0;
        s = _f((s + idx) >>> 0);
      } else {
        slots[i] = SHA_C[i & 15];
      }
    }
    return { slots: slots, acc: _f((0xa5a5a5a5 ^ s) >>> 0) >>> 0 };
  }
  function _next(state, counter) {
    var slots = state.slots, acc = state.acc;
    var idx = acc % 61;
    var missing = (idx in slots) ? -1 : 0;
    var v = slots[idx] >>> 0;
    var t = ((v ^ Math.imul(0x9e3779b9, counter + 1)) >>> 0) >>> 0;
    var w = (((acc ^ t) >>> 0 | ((acc & t & missing) >>> 0)) >>> 0) >>> 0;
    var u = (_rotl((w + acc) >>> 0, idx & 31) ^ _rotl(acc, Math.imul(idx, 7) & 31)) >>> 0;
    var r = _f((u + 0x9e3779b9) >>> 0);
    slots[idx] = r >>> 0;
    state.acc = r;
    return r >>> 0;
  }
  function _keystream(seed, mediaId, len) {
    var st = _makeState(seed, mediaId);
    var out = new Uint8Array(len);
    var i = 0;
    var wc = 0;
    while (i < len) {
      var w = _next(st, wc++);
      out[i++] = w & 0xff;
      if (i < len) out[i++] = (w >>> 8) & 0xff;
      if (i < len) out[i++] = (w >>> 16) & 0xff;
      if (i < len) out[i++] = (w >>> 24) & 0xff;
    }
    return out;
  }
  function _b64urlToBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    var bin;
    if (typeof atob === 'function') {
      bin = atob(s);
    } else {
      var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var clean = '';
      for (var q = 0; q < s.length; q++) { var c = s.charAt(q); if (c !== '=' && CH.indexOf(c) !== -1) clean += c; }
      bin = '';
      for (var w = 0; w < clean.length; w += 4) {
        var a = CH.indexOf(clean.charAt(w)), b = CH.indexOf(clean.charAt(w + 1));
        var c2 = w + 2 < clean.length ? CH.indexOf(clean.charAt(w + 2)) : -1;
        var d2 = w + 3 < clean.length ? CH.indexOf(clean.charAt(w + 3)) : -1;
        bin += String.fromCharCode((a << 2) | (b >> 4));
        if (c2 !== -1) bin += String.fromCharCode(((b & 15) << 4) | (c2 >> 2));
        if (d2 !== -1) bin += String.fromCharCode(((c2 & 15) << 6) | d2);
      }
    }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  function _utf8(bytes, start) {
    var s = '';
    var i = start || 0;
    while (i < bytes.length) {
      var b = bytes[i++];
      if (b < 0x80) s += String.fromCharCode(b);
      else if ((b & 0xe0) === 0xc0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
      else if ((b & 0xf0) === 0xe0) s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
      else if ((b & 0xf8) === 0xf0) {
        var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else s += String.fromCharCode(b);
    }
    return s;
  }
  function wingsDecrypt(payloadB64, seed, mediaId) {
    var bytes = _b64urlToBytes(payloadB64);
    var ks = _keystream(seed, mediaId, bytes.length);
    for (var i = 0; i < bytes.length; i++) bytes[i] = (bytes[i] ^ ks[i]) & 0xff;
    for (var m = 0; m < MAGIC.length; m++) {
      if (bytes[m] !== MAGIC[m]) throw new Error('wings decrypt failed: bad magic');
    }
    return _utf8(bytes, MAGIC.length);
  }

  function _fetchX(url, opts) {
    var f = (typeof __nvFetch === 'function') ? __nvFetch : (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('no fetch'));
    return f(url, opts);
  }
  function _race(p, ms, fallback) {
    if (typeof setTimeout !== 'function') {
      /* device QuickJS ships no timers - the timer leg must never throw */
      return Promise.resolve(p).then(function (v) { return v; }, function () { return fallback; });
    }
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      if (t && typeof t.unref === 'function') t.unref();
      Promise.resolve(p).then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
                              function () { if (!done) { done = true; clearTimeout(t); resolve(fallback); } });
    });
  }
  function _jsonText(resp) {
    return Promise.resolve(resp.text()).catch(function () { return ''; });
  }

  var __wingsMetaCache = {};
  var __wingsSeedCache = {};
  function wingsTmdbMeta(tmdbId, mediaType) {
    var ck = mediaType + ':' + parseInt(tmdbId, 10);
    if (__wingsMetaCache[ck]) return Promise.resolve(__wingsMetaCache[ck]);
    var url = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' +
      parseInt(tmdbId, 10) + '?api_key=' + TMDB_KEY + '&append_to_response=external_ids';
    return _race(
      _fetchX(url, { headers: { 'User-Agent': WINGS_UA, 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) return null;
          return {
            title: mediaType === 'tv' ? j.name : j.title,
            year: ((mediaType === 'tv' ? j.first_air_date : j.release_date) || '').substring(0, 4),
            imdbId: (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || ''
          };
        }),
      6000, null).then(function (m) { if (m && m.title) __wingsMetaCache[ck] = m; return m; });
  }

  function wingsQueryServer(serverPath, seed, meta, mediaType, season, episode, tmdbId) {
    var params = 'title=' + encodeURIComponent(meta.title || '') +
      '&mediaType=' + (mediaType === 'tv' ? 'tv' : 'movie') +
      '&year=' + encodeURIComponent(String(meta.year || '')) +
      '&episodeId=' + String(mediaType === 'tv' ? (episode || 1) : 1) +
      '&seasonId=' + String(mediaType === 'tv' ? (season || 1) : 1) +
      '&tmdbId=' + String(tmdbId) +
      '&imdbId=' + encodeURIComponent(meta.imdbId || '') +
      '&enc=2&seed=' + encodeURIComponent(seed);
    return _fetchX(WINGS_BASE + '/' + serverPath + '?' + params, { headers: WINGS_HEADERS })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (txt) {
        if (!txt || !txt.length) throw new Error('empty');
        var json = wingsDecrypt(txt, seed, parseInt(tmdbId, 10));
        var obj = JSON.parse(json);
        return obj;
      });
  }

  function wingsNormQuality(q) {
    var s = String(q || '').toLowerCase();
    if (s.indexOf('2160') !== -1 || s.indexOf('4k') !== -1) return '4K';
    if (s.indexOf('1440') !== -1) return '1440p';
    if (s.indexOf('1080') !== -1) return '1080p';
    if (s.indexOf('720') !== -1) return '720p';
    if (s.indexOf('480') !== -1) return '480p';
    return 'Auto';
  }

  /**
   * __nvWingsStreams(opts) -> Promise<rows[]>
   */
  function __nvWingsStreams(opts) {
    opts = opts || {};
    var label = opts.label || 'Wings';
    var timeoutMs = opts.timeoutMs || 20000;
    try {
      var tmdbId = parseInt(String(opts.tmdbId || '').replace(/\D/g, ''), 10);
      if (!tmdbId) return Promise.resolve([]);
      var mediaType = opts.mediaType === 'tv' || opts.mediaType === 'series' ? 'tv' : 'movie';
      return wingsTmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) return [];
        if (__wingsSeedCache[tmdbId]) return Promise.resolve({ seed: __wingsSeedCache[tmdbId] });
        return _fetchX(WINGS_BASE + '/seed?mediaId=' + tmdbId, { headers: WINGS_HEADERS })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j || !j.seed) throw new Error('no seed');
            var seed = (__wingsSeedCache[tmdbId] = j.seed);
            var jobs = (opts.servers && opts.servers.length ? opts.servers : WINGS_SERVERS).map(function (sp) {
              return wingsQueryServer(sp, seed, meta, mediaType, opts.season, opts.episode, tmdbId)
                .then(function (o) { return o; }, function () { return null; });
            });
            /* collect PARTIAL results: never gate on the slowest server.
             * undefined = still pending, null = failed, object = success. */
            return new Promise(function (resolve) {
              var results = new Array(jobs.length);
              var done = false;
              var t = null;
              if (typeof setTimeout === 'function') {
                /* device QuickJS ships no timers - guard every timer use */
                t = setTimeout(function () { if (!done) { done = true; resolve(results); } }, Math.max(6000, timeoutMs - 2500));
                if (t && typeof t.unref === 'function') t.unref();
              }
              var pending = jobs.length;
              var settle = function () {
                if (!done) { done = true; if (t) clearTimeout(t); resolve(results); }
              };
              jobs.forEach(function (jp, idx) {
                Promise.resolve(jp).then(function (obj) {
                  results[idx] = obj; pending--; if (pending <= 0) settle();
                }, function () {
                  results[idx] = null; pending--; if (pending <= 0) settle();
                });
              });
            }).then(function (results) {
              results = results || [];
              var seen = {};
              var rows = [];
              for (var i = 0; i < results.length; i++) {
                var obj = results[i];
                if (!obj) continue;
                var subs = (obj.subtitles || []).filter(function (s) { return s && s.url; })
                  .map(function (s) {
                    return { url: s.url, language: s.lang || s.language || 'en', name: s.language || s.lang || 'English' };
                  });
                var srcs = obj.sources || [];
                for (var k = 0; k < srcs.length; k++) {
                  var src = srcs[k];
                  if (!src || !src.url) continue;
                  if (seen[src.url]) continue;
                  seen[src.url] = true;
                  var q = wingsNormQuality(src.quality);
                  rows.push({
                    name: label + ' | ' + q,
                    title: label + ' ' + q + (mediaType === 'tv' ? ' S' + (opts.season || 1) + 'E' + (opts.episode || 1) : ''),
                    url: src.url,
                    quality: q,
                    headers: {
                      'User-Agent': WINGS_UA,
                      'Referer': 'https://www.vidking.net/',
                      'Origin': 'https://www.vidking.net'
                    },
                    subtitles: subs
                  });
                }
              }
              rows.sort(function (a, b) {
                var order = { '4K': 4, '1440p': 3, '1080p': 2, '720p': 1 };
                return (order[b.quality] || 0) - (order[a.quality] || 0);
              });
              return rows;
            });
          });
      }).catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  if (typeof globalThis !== 'undefined') globalThis.__nvWingsStreams = __nvWingsStreams;
})();


/* --- Lane T2: MovieBox CDN addon (movies only, plain GET JSON) --- */
/* --- Lane T3: vidlove API moviebox2 server (movie+tv, 4.32.0-proven shape) --- */
var _CJ_VL_BASE = "https://api.vidlove.cc";
var _CJ_VL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function cinejoyVidloveRows(ctx) {
  return __async(this, null, function* () {
    if (!ctx || (!ctx.tmdbId && !ctx.imdbId))
      return [];
    const isTv = !!ctx.isTv;
    // 4.32.0-proven invocation: the id goes through as the provider's own
    // first getStreams arg (tmdb id). imdb also resolves for movies, but the
    // tv endpoint wants the numeric tmdb id (imdb -> "Invalid TMDB ID").
    const qid = String(ctx.tmdbId || ctx.imdbId);
    let params = "id=" + encodeURIComponent(qid) + "&mode=json&sources=moviebox2";
    if (isTv)
      params += "&season=" + encodeURIComponent(ctx.season || 1) + "&episode=" + encodeURIComponent(ctx.episode || 1);
    const out = [];
    try {
      const p = fetch(_CJ_VL_BASE + "/" + (isTv ? "tv" : "movie") + "?" + params, {
        headers: { "User-Agent": _CJ_VL_UA, Accept: "application/json", Referer: "https://player.vidlove.cc/" }
      }).then(function (r) { return r && r.ok ? r.json() : null; });
      const j = yield (hasTimers()
        ? Promise.race([p, new Promise(function (res) { const t = setTimeout(function () { res(null); }, 6500); if (t && typeof t.unref === "function") t.unref(); })])
        : p);
      const s = j && j.source;
      if (s && s.url && String(s.url).indexOf("http") === 0) {
        // 4.33.0 pack rule: the VidAPI relay (tungtungtungsahur.cfd YT-rips,
        // 640x266) is junk - best-mode can return it, so guard here too.
        if (/tungtungtungsahur\.cfd/i.test(String(s.url)))
          return out;
        const subs = (j.subtitles || []).slice(0, 6).map(function (st) {
          return { url: st.file, language: "en", name: st.label || "Subtitle" };
        }).filter(function (x) { return x.url; });
        const sRow = makeStream("Cinejoy", "Cinejoy MovieBox | " + (s.label || "moviebox2") + "\n\ud83d\udcfa quality resolves at playback", String(s.url), "", { Referer: "https://player.vidlove.cc/", "User-Agent": _CJ_VL_UA }, subs);
        if (sRow)
          out.push(sRow);
      }
    } catch (e) {
      return out;
    }
    return out;
  });
}

/* ===== nv-plugins device-realistic waterfall v3.0.0 (pack 4.36.0) ==========
   Runtime truth (read from NuvioMobile PluginRuntime.kt + the quickjs-kt
   1.0.5-nuvio AAR + NuvioTVSmart pluginWorker.js):
     - fetch = one BLOCKING host call (runBlocking in the Kotlin bridge);
       "parallel" lanes actually run one request at a time on device.
     - the QuickJS runtime ships NO timers -> every Promise.race cap in
       v2.x was inert on device; nothing could preempt a slow fetch.
     - each request can block up to 60s (OkHttp) and the app kills the
       whole provider call at withTimeout(60s): v2.1.0's lane sum (native
       shegu sweep + Render addon wake + WINGS fan-out + subs) blew past
       it -> 0 rows on every device run.
   v3.0.0 therefore bounds the provider by FETCH COUNT, not timers, and
   early-returns the moment a lane produces rows:
     S1  WINGS one server at a time (cdn -> m4uhd -> lamovie); TMDB meta +
         seed cached so repeat calls cost 1 fetch each
     S2  vidlove moviebox2 (movie+tv, 1 fetch)
     S3  native shegu chain - ONLY when it can work: cjRelay configured
         (worker /cjg+/cjs relay) or node-class runtime (tests). Device
         without relay: skipped entirely (0 fetches, was ~12 doomed).
   The onrender MovieBox addon lane is REMOVED: a cold Render wake blocks
   the device bridge 30-60s on one fetch and can solo-kill the call.
   Worst device path ~9 fetches; typical success path 2-4 fetches.
========================================================================== */
var __cjWingsServers = ["cdn/sources-with-title", "m4uhd/sources-with-title", "lamovie/sources-with-title"];

function cinejoyNodeRuntime() {
  try {
    return typeof process !== "undefined" && !!(process.versions && process.versions.node);
  } catch (e) { return false; }
}

function cinejoyWingsOnce(ctx, server) {
  const wings = (typeof globalThis !== "undefined" && globalThis.__nvWingsStreams) ||
                (typeof global !== "undefined" && global.__nvWingsStreams) || null;
  if (!wings || !ctx.tmdbId)
    return Promise.resolve([]);
  return Promise.resolve(wings({
    tmdbId: String(ctx.tmdbId),
    mediaType: ctx.isTv ? "tv" : "movie",
    season: ctx.season || 1,
    episode: ctx.episode || 1,
    label: "Cinejoy",
    timeoutMs: 9000,
    servers: [server]
  })).then(function (rows) { return rows || []; }).catch(function () { return []; });
}

function cinejoyNativeOnce(ctx) {
  // Device bridges (Mobile QuickJS + TV pluginWorker): only the /cjg+/cjs
  // relay can carry the binary chain. Node-class runtimes (tests) go direct.
  if (relayBase() || cinejoyNodeRuntime())
    return Promise.resolve(scrapeNative(ctx)).catch(function () { return []; });
  return Promise.resolve([]);
}

/**
 * v3.0.0 orchestrator: sequential waterfall, early-return on first rows,
 * fetch-count bounded (see the block comment above). URL-deduped output.
 */
function scrape(ctx) {
  return __async(this, null, function* () {
    const out = [];
    const push = (rows) => { (rows || []).forEach(function (s) { if (s && s.url) out.push(s); }); };
    // S1: WINGS, one server at a time - early exit as soon as rows exist
    for (let i = 0; i < __cjWingsServers.length && !out.length; i++) {
      push(yield cinejoyWingsOnce(ctx, __cjWingsServers[i]));
    }
    // S2: vidlove moviebox2
    if (!out.length) {
      try { push(yield cinejoyVidloveRows(ctx)); } catch (e) {}
    }
    // S3: native shegu (relay on device / direct binary in node tests)
    if (!out.length) {
      push(yield cinejoyNativeOnce(ctx));
    }
    const seen = {};
    const merged = [];
    out.forEach(function (s) {
      if (!s || !s.url)
        return;
      const nu = String(s.url).replace(/[#?].*$/, "");
      if (seen[nu])
        return;
      seen[nu] = 1;
      merged.push(s);
    });
    if (!merged.length)
      console.log("[Streamline][cinejoy] 0 rows from all lanes (wings cdn/m4uhd/lamovie -> vidlove moviebox2 -> native/relay) for \"" + (ctx.title || "?") + "\" - please report this title");
    return merged;
  });
}

function scrapeNative(ctx) {
  return __async(this, null, function* () {
    if (!enabled())
      return [];
    if (!ctx.title)
      return [];
    if (!relayBase() && !cinejoyNodeRuntime()) {
      // Device bridges stringify request bodies ("[object Uint8Array]"),
      // so every direct /g attempt is a guaranteed 404. v2.x still burned
      // ~12 blocking fetches on this sweep; v3.0.0 skips it entirely.
      console.log("[Streamline][cinejoy] native shegu chain skipped: binary /g impossible on this runtime (string bridge) and no cjRelay set - text lanes cover this title");
      return [];
    }
    const isTv = ctx.isTv;
    const type = isTv ? "series" : "movie";
    const headers = {
      Accept: "*/*",
      Origin: CINEJOY_BASE,
      Referer: CINEJOY_BASE + "/",
      "User-Agent": UA
    };
    try {
      const serversJson = JSON.parse(yield fetchText(CINEJOY_API + "/servers", headers, 15e3));
      const servers = serversJson && serversJson.servers || [];
      if (!servers.length)
        return [];
      // v1.5.0: parallel waves of 3 servers; v1.7.0: sweep covers ALL
      // servers (8x) in three waves - the last wave (Sakura, Canaias) does
      // carry titles the first waves miss.
      const out = [];
      const waves = [servers.slice(0, 3), servers.slice(3, 6), servers.slice(6, 9)];
      const runWave = (list) => Promise.all(list.map(function(srv) {
        return scrapeServer(srv, ctx, headers, type).catch(function() { return []; });
      }));
      for (let w = 0; w < waves.length && waves[w].length; w++) {
        const rw = yield runWave(waves[w]);
        rw.forEach(function(arr) { out.push.apply(out, arr); });
        if (out.length) break;
      }
      // v1.6.1/v1.7.0: say WHY the sheet is empty - on Mobile the binary /g
      // legs are structurally impossible, so an unconfigured relay is the
      // usual cause; TV/PC direct failures point at enc-dec.app reachability.
      if (!out.length) {
        const rb = relayBase();
        if (!rb) {
          console.log("[Streamline][cinejoy] 0 rows and no relay configured. NuvioMobile CANNOT send the binary /g request - set the 'Cinejoy relay base URL' setting to your asian-catalog worker URL (bundle v5.7.0+ with /cjg + /cjs). NuvioTV/PC resolve without it.");
        } else {
          console.log("[Streamline][cinejoy] 0 rows with relay " + rb + " - check the worker is deployed (bundle v5.7.0+, /cjg + /cjs routes) and enc-dec.app is reachable from it");
        }
      }
      return out;
    } catch (e) {
      console.log("[Streamline][cinejoy] " + e.message);
      return [];
    }
  });
}

// src/cinejoy/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const ctx = yield buildCtx(tmdbId, mediaType, season, episode);
      const out = yield withTimeout(scrape(ctx), 2e4, "cinejoy");
      let withSubs = out;
      try {
        if (hasTimers()) {
          withSubs = yield Promise.race([
            withSharedSubs(out, ctx),
            new Promise(function (res) {
              const t = setTimeout(function () { res(out); }, 2500);
              if (t && typeof t.unref === "function") t.unref();
            })
          ]);
        } else {
          // Device (QuickJS realm: no timers): withSharedSubs is a sequential
          // chain of blocking fetches with 12s caps each - but NO race cap
          // wraps the chain, so unreachable subtitle hosts rode the whole
          // call past the app's 60s kill and the ALREADY-EXTRACTED rows died
          // with it (the "0 rows on device while node shows rows" report).
          // Streams are the product; on device we return rows immediately and
          // skip the garnish. Node/TV (timers exist) keep the 2.5s race.
          withSubs = out;
        }
      } catch (eSubs) {
        withSubs = out;
      }
      return presentStreams(dedupe(withSubs), ctx);
    } catch (e) {
      console.log("[Streamline][cinejoy] " + (e && e.message));
      return [];
    }
  });
}
function onSettings() {
  return __async(this, null, function* () {
    return [
      {
        key: "cjRelay",
        title: "Cinejoy relay base URL (Cloudflare Worker)",
        label: "Cinejoy relay base URL",
        type: "text",
        default: "",
        description: "NuvioMobile cannot send the binary request cinejoy.to's API needs. Paste your asian-catalog worker base URL (https://<your-worker>.workers.dev) running the v5.7.0+ bundle with the /cjg and /cjs relay routes. Leave blank on NuvioTV/PC - the direct lane works there without a relay."
      },
      wyzieKeyField()
    ];
  });
}
module.exports = { getStreams, onSettings };

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
  var PROVIDER = "cinejoy";
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
  function probeM3u8(url, headers) {
    var now = Date.now();
    var c = qualCache[url];
    if (c && now - c.t < (c.q ? 15 * 60 * 1000 : 3 * 60 * 1000)) {
      return Promise.resolve(c.q);
    }
    var opts = { headers: Object.assign({}, headers || {}) };
    var p = fetch(url, opts).then(function (r) {
      return r.ok ? r.text() : "";
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
    }).catch(function () { qualCache[url] = { t: now, q: "" }; return ""; });
    if (hasTimers()) {
      p = Promise.race([p, new Promise(function (res) {
        var timer = setTimeout(function () { res(""); }, 2000);
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
        var s = row.s;
        var tq = normQ(s.quality) || normQ(String(s.title || "").split("\n")[0]) || qFromText((s.name || "") + " " + (s.title || ""));
        // nv best-settings 4.26.0: FAIL-OPEN quality gate (AIO parity)
        // - a successful HLS probe result wins
        // - otherwise the title-derived quality is kept, else "Auto"
        // - unknown-resolution rows are NO LONGER dropped; only rows whose
        //   title explicitly tags CAM/telesync/sub-720p are removed
        var q = qs[k] || tq || "Auto";
        if (q === "CAM") return; // explicit cam / sd / sub-720 tag -> removed
        s.quality = q;
        ranked.push({ s: s, i: row.i, q: q });
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
          if (typeof setTimeout === "function") {
            // nv best-settings 4.23.0: hard 20s cap on the whole provider run (4.34.0: WINGS flush needs the room)
            r = Promise.race([r, new Promise(function (res) {
              var dl = setTimeout(function () { res([]); }, 20000);
              if (dl && typeof dl.unref === "function") dl.unref();
            })]);
          }
          return r.then(function (v) { return finish(v); }, function () { return []; });
        }
        return finish(r);
      } catch (e) { return Promise.resolve([]); }
    };
  }
})();
