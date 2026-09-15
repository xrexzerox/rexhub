/* nv-plugins nakios.js v2.0.0 (pack 4.40.0 "all providers readable")
 * Full clean rebuild of the 4.39 single-line blob. Same flow, semantic
 * names: TMDB meta (+ episode info for tv) -> domains.json endpoint detect
 * (fallback "click") -> GET api.nakios.{host}/sources/{movie|tv}/{id}
 * -> non-embed sources -> direct or /?url= proxy-resolved rows with
 * VF/MULTI/VOSTFR flags (Nakios is a French-market source).
 * Device notes: timer-guarded __nvFetch, response.ok checks, fail-soft,
 * no require/cheerio/TextDecoder; post-filter tail (en/tl gate, >=720p).
 */
/* ===== nv-plugins device polyfills v1.0.0 (pack 4.37.0, 2026-09-14) ============ */
(function() {
  var G = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this);
  if (typeof G.atob !== 'function') {
    var _CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    G.atob = function(s) {
      s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
      var out = '', bits = 0, acc = 0, i;
      for (i = 0; i < s.length; i++) {
        acc = (acc << 6) | _CH.indexOf(s.charAt(i));
        bits += 6;
        if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 0xff); }
      }
      return out;
    };
  }
  if (typeof G.btoa !== 'function') {
    var _CH2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    G.btoa = function(s) {
      var out = '', bits = 0, acc = 0, i;
      for (i = 0; i < String(s).length; i++) {
        acc = (acc << 8) | String(s).charCodeAt(i);
        bits += 8;
        while (bits >= 6) { bits -= 6; out += _CH2[(acc >> bits) & 0x3f]; }
      }
      if (bits) out += _CH2[(acc << (6 - bits)) & 0x3f];
      while (out.length % 4) out += '=';
      return out;
    };
  }
})();

/* ===== timer-guarded fetch deadline (house style) ========================== */
function __nvFetch(url, options, timeoutMs) {
  options = options || {};
  if (typeof setTimeout !== "function") return fetch(url, options);
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error("nv deadline " + (timeoutMs || 8000) / 1000 + "s")); }, timeoutMs || 8000);
    if (t && typeof t.unref === "function") t.unref();
    fetch(url, options).then(function (res) { clearTimeout(t); resolve(res); },
      function (e) { clearTimeout(t); reject(e); });
  });
}

var TMDB_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";
var NAKIOS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var DOMAINS_URL = "https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json";
var NAKIOS_FALLBACK = "click";
var __cachedEndpoint = null;

function getTmdbMetadata(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" +
    encodeURIComponent(tmdbId) + "?api_key=" + TMDB_KEY + "&language=en-US";
  return __nvFetch(url).then(function (res) {
    return res.json();
  }).then(function (data) {
    var name = data.title || data.name || "Nakios";
    var date = data.release_date || data.first_air_date || "";
    var year = date ? date.split("-")[0] : "";
    var duration = "";
    if (mediaType === "movie" && data.runtime) duration = data.runtime + " min";
    else if (mediaType === "tv" && data.episode_run_time && data.episode_run_time.length > 0) {
      duration = data.episode_run_time[0] + " min";
    }
    return { name: name, year: year, duration: duration };
  }).catch(function () {
    return { name: "Nakios", year: "", duration: "" };
  });
}

function getEpisodeInfo(tmdbId, season, episode) {
  if (!tmdbId || !season || !episode) return Promise.resolve(null);
  var url = "https://api.themoviedb.org/3/tv/" + encodeURIComponent(tmdbId) + "/season/" +
    parseInt(season, 10) + "/episode/" + parseInt(episode, 10) + "?api_key=" + TMDB_KEY + "&language=en-US";
  return __nvFetch(url).then(function (res) {
    return res.json();
  }).then(function (data) {
    return {
      name: data.name || null,
      duration: data.runtime ? data.runtime + " min" : null
    };
  }).catch(function () { return null; });
}

/** domain -> { base, api, referer } (host answer or "nakios.<domain>"). */
function buildEndpoint(domain) {
  var host = String(domain || "").indexOf("nakios") !== -1 ? domain : "nakios." + domain;
  return {
    base: "https://" + host,
    api: "https://api." + host + "/api",
    referer: "https://" + host + "/"
  };
}

function detectEndpoint() {
  if (__cachedEndpoint) return Promise.resolve(__cachedEndpoint);
  return __nvFetch(DOMAINS_URL).then(function (res) {
    return res.ok ? res.json() : Promise.reject(new Error("domains http " + res.status));
  }).then(function (map) {
    __cachedEndpoint = buildEndpoint(map.nakios || NAKIOS_FALLBACK);
    return __cachedEndpoint;
  }).catch(function () {
    __cachedEndpoint = buildEndpoint(NAKIOS_FALLBACK);
    return __cachedEndpoint;
  });
}

function extractOrigin(url) {
  var m = String(url || "").match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : null;
}

/** One raw source entry -> { url, format, referer, origin } or null. */
function resolveSource(entry, endpoint) {
  var raw = entry.url || "";
  if (raw.indexOf("http") === 0) {
    return {
      url: raw,
      format: entry.isM3U8 || raw.indexOf(".m3u8") !== -1 ? "m3u8" : "mp4",
      referer: endpoint.referer,
      origin: endpoint.base
    };
  }
  if (raw.charAt(0) === "/") {
    // proxied playlist: /path/?url=<encoded target>
    var m = raw.match(/[?&]url=([^&]+)/);
    if (!m) return null;
    var target;
    try { target = decodeURIComponent(m[1]); } catch (e) { return null; }
    var origin = extractOrigin(target);
    return {
      url: target,
      format: "m3u8",
      referer: origin ? origin + "/" : endpoint.referer,
      origin: origin || endpoint.base
    };
  }
  return null;
}

function normalizeSources(rawSources, endpoint, meta, season, episode, episodeInfo) {
  var rows = [];
  for (var i = 0; i < rawSources.length; i++) {
    var entry = rawSources[i];
    if (entry.isEmbed) continue;
    var resolved = resolveSource(entry, endpoint);
    if (!resolved) continue;

    var quality = entry.quality || "HD";
    var lang = String(entry.lang || "MULTI").toUpperCase();
    var format = resolved.format.toUpperCase();
    var flag = "🇫🇷", audio = "VF";
    if (lang.indexOf("MULTI") !== -1 || (entry.name && String(entry.name).toUpperCase().indexOf("MULTI") !== -1)) {
      flag = "🌍"; audio = "MULTI";
    } else if (lang.indexOf("VOST") !== -1) {
      flag = "🔡"; audio = "VOSTFR";
    }

    var titleLine = "🎬 ";
    if (season && episode) {
      var epSuffix = episodeInfo && episodeInfo.name ? " - " + episodeInfo.name : "";
      titleLine += "S" + season + " E" + episode + epSuffix + " | " + meta.name;
    } else {
      titleLine += meta.name + (meta.year ? " - " + meta.year : "");
    }

    var infoBits = ["📺 " + quality, flag + " " + audio, "🎞️ " + format];
    if (entry.size) infoBits.push("💾 " + entry.size);
    var duration = (episodeInfo && episodeInfo.duration) ? episodeInfo.duration : meta.duration;
    if (duration) infoBits.push("⏱️ " + duration);

    rows.push({
      name: "Nakios - " + quality,
      title: titleLine + "\n" + infoBits.join(" | "),
      url: resolved.url,
      quality: quality,
      format: resolved.format,
      headers: {
        "User-Agent": NAKIOS_UA,
        "Referer": resolved.referer,
        "Origin": resolved.origin
      }
    });
  }
  return rows;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.all([
    getTmdbMetadata(tmdbId, mediaType),
    mediaType === "tv" ? getEpisodeInfo(tmdbId, season, episode) : Promise.resolve(null),
    detectEndpoint()
  ]).then(function (results) {
    var meta = results[0];
    var episodeInfo = results[1];
    var endpoint = results[2];
    var url = mediaType === "tv"
      ? endpoint.api + "/sources/tv/" + encodeURIComponent(tmdbId) + "/" + (season || 1) + "/" + (episode || 1)
      : endpoint.api + "/sources/movie/" + encodeURIComponent(tmdbId);
    return __nvFetch(url, { headers: { "User-Agent": NAKIOS_UA, "Referer": endpoint.referer } }).then(function (res) {
      if (!res.ok) return [];
      return res.json().then(function (data) {
        if (!data.success || !data.sources) return [];
        var s = mediaType === "tv" ? season : null;
        var e = mediaType === "tv" ? episode : null;
        return normalizeSources(data.sources, endpoint, meta, s, e, episodeInfo);
      }).catch(function () { return []; });
    }).catch(function () { return []; });
  }).catch(function () { return []; });
}

module.exports = { getStreams: getStreams };

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
  var PROVIDER = "nakios";
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
    var p = __nvFetch(url, opts).then(function (r) {
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
        var timer = setTimeout(function () { res(""); }, 6000);
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
        if (!q) return; // unknown resolution -> removed
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
          if (typeof setTimeout === "function") {
            // nv best-settings 4.23.0: hard 8s cap on the whole provider run
            r = Promise.race([r, new Promise(function (res) {
              var dl = setTimeout(function () { res([]); }, 8000);
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
