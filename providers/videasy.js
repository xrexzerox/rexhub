/* nv-plugins videasy.js v7.0.0 (pack 4.40.0 "all providers readable")
 * Full clean rebuild; machine names removed, flow = device-verified 4.39.
 * Lane: api.speedracelight.com seed -> 10 named servers parallel, "mvm1"
 * keystream payloads, 9s partial collect. WINGS lane + light deadline
 * wrapper (12s) + waterfall merge (VidEasy) appended below. No post-filter
 * (4.39 parity - this provider never carried one).
 */
/* ===== nv-plugins device polyfills v1.0.0 (pack 4.37.0, 2026-09-14) ============
   The Nuvio QuickJS plugin runtime (quickjs-kt 1.0.5-nuvio AAR) is a bare
   ES2020 realm: no atob/btoa, no URLSearchParams, no TextDecoder, no timers.
   These polyfills are define-only-if-missing, so node/desktop runtimes are
   completely unaffected. ==================================================== */
(function() {
  var G = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this);
  if (typeof G.atob !== 'function') {
    var _CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    G.atob = function(s) {
      s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
      var out = '',
        bits = 0,
        acc = 0,
        i;
      for (i = 0; i < s.length; i++) {
        acc = (acc << 6) | _CH.indexOf(s.charAt(i));
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out += String.fromCharCode((acc >> bits) & 0xff);
        }
      }
      return out;
    };
  }
  if (typeof G.btoa !== 'function') {
    var _CH2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    G.btoa = function(s) {
      s = String(s);
      var out = '',
        i;
      for (i = 0; i < s.length; i += 3) {
        var b0 = s.charCodeAt(i),
          b1 = s.charCodeAt(i + 1),
          b2 = s.charCodeAt(i + 2);
        var has1 = !(i + 1 >= s.length || isNaN(b1)),
          has2 = !(i + 2 >= s.length || isNaN(b2));
        out += _CH2.charAt(b0 >> 2);
        out += _CH2.charAt(((b0 & 3) << 4) | (has1 ? b1 >> 4 : 0));
        out += has1 ? _CH2.charAt(((b1 & 15) << 2) | (has2 ? b2 >> 6 : 0)) : '=';
        out += has2 ? _CH2.charAt(b2 & 63) : '=';
      }
      return out;
    };
  }
  if (typeof G.URLSearchParams !== 'function') {
    var USP = function(init) {
      this._m = {};
      if (init && typeof init === 'object') {
        for (var k in init)
          if (Object.prototype.hasOwnProperty.call(init, k)) this._m[k] = [String(init[k])];
      }
    };
    USP.prototype.append = function(k, v) {
      (this._m[k] = this._m[k] || []).push(String(v));
    };
    USP.prototype.set = function(k, v) {
      this._m[k] = [String(v)];
    };
    USP.prototype.get = function(k) {
      var a = this._m[k];
      return a && a.length ? a[0] : null;
    };
    USP.prototype.has = function(k) {
      return Object.prototype.hasOwnProperty.call(this._m, k);
    };
    USP.prototype.toString = function() {
      var out = [];
      for (var k in this._m) {
        if (!Object.prototype.hasOwnProperty.call(this._m, k)) continue;
        var vs = this._m[k];
        for (var i = 0; i < vs.length; i++)
          out.push(encodeURIComponent(k).replace(/%20/g, '+') + '=' + encodeURIComponent(vs[i]).replace(
            /%20/g, '+'));
      }
      return out.join('&');
    };
    G.URLSearchParams = USP;
  }
})();

var __nvFetch = (function() {
  var _f = null;
  try {
    _f = (typeof fetch === "function") ? fetch : null;
  } catch (e) {
    _f = null;
  }
  if (!_f) return function() {
    return Promise.reject(new Error("no fetch"));
  };
  var hasT = typeof setTimeout === "function";
  return function(input, init) {
    var p;
    try {
      p = _f.apply(this, arguments);
    } catch (e) {
      return Promise.reject(e);
    }
    if (!hasT || !p || typeof p.then !== "function") return p;
    return Promise.race([p, new Promise(function(_res, rej) {
      var t = setTimeout(function() {
        rej(new Error("nv deadline 8s"));
      }, 8000);
      if (t && typeof t.unref === "function") t.unref();
    })]);
  };
})();

/* ============================================================
 * nv-plugins videasy.js v7.0.0 (pack 4.40.0 "all providers readable")
 * ------------------------------------------------------------
 * Clean readable rebuild of the VidEasy native lane. Machine names
 * removed; flow identical to the device-verified 4.39 build.
 *
 * Lane: GET api.speedracelight.com/seed?mediaId={tmdbId} -> ten named
 *   servers (Hydrogen/Titanium/Oxygen/Lithium/Krypton/Carbon/Aluminium/
 *   Nitrogen/Neon/Helium) queried in parallel at /{path}?title=..&enc=2
 *   &seed=.. -> each payload is base64url + "mvm1" keystream XOR ->
 *   sources[] rows + subtitles[]; 9s partial collect, URL dedup.
 * Device notes: timer-guarded __nvFetch, response.ok checks, fail-soft
 *   per server, WINGS lane + light deadline wrapper + waterfall merge.
 * ============================================================ */

var WINGS_API_BASE = "https://api.speedracelight.com";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var REQUEST_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "*/*",
  "Origin": "https://www.vidking.net",
  "Referer": "https://www.vidking.net/",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Pragma": "no-cache"
};

var SERVERS = {
  Hydrogen: { path: "cdn/sources-with-title" },
  Titanium: { path: "tejo/sources-with-title" },
  Oxygen: { path: "neon2/sources-with-title" },
  Lithium: { path: "downloader2/sources-with-title" },
  Krypton: { path: "ym/sources-with-title" },
  Carbon: { path: "mb-flix/sources-with-title" },
  Aluminium: { path: "lamovie/sources-with-title" },
  Nitrogen: { path: "m4uhd/sources-with-title" },
  Neon: { path: "superflix/sources-with-title" },
  Helium: { path: "1movies/sources-with-title" }
};

var SERVER_EMOJI = {
  Hydrogen: "💧", Titanium: "🛡️", Oxygen: "💨", Lithium: "🔋", Krypton: "🦸",
  Carbon: "💎", Aluminium: "💿", Nitrogen: "🌿", Neon: "💡", Helium: "🎈"
};
var SERVER_LABEL = {
  Hydrogen: "CDN", Titanium: "Tejo", Oxygen: "Neon2", Lithium: "Downloader2",
  Krypton: "YM", Carbon: "MB-Flix", Aluminium: "LaMovie", Nitrogen: "M4UHD",
  Neon: "SuperFlix", Helium: "1Movies"
};
var SERVER_AUDIO = {
  Hydrogen: ["Original Audio", "🌍 Original Audio"],
  Krypton: ["Original Audio", "🌍 Original Audio"],
  Oxygen: ["Multi-Audio", "🌍 Multi-Audio"],
  Aluminium: ["Dual-Audio", "🌍 Dual-Audio"]
};

function getLangCode(name) {
  var s = String(name || "").toLowerCase();
  if (s.indexOf("english") !== -1 || s === "en") return "en";
  if (s.indexOf("spanish") !== -1 || s.indexOf("espanol") !== -1 || s === "es") return "es";
  if (s.indexOf("french") !== -1 || s.indexOf("fran") !== -1 || s === "fr") return "fr";
  if (s.indexOf("german") !== -1 || s === "de") return "de";
  if (s.indexOf("hindi") !== -1 || s === "hi") return "hi";
  if (s.indexOf("arabic") !== -1 || s === "ar") return "ar";
  if (s.indexOf("tagalog") !== -1 || s.indexOf("filipino") !== -1) return "fil";
  return String(name || "en").slice(0, 3).toLowerCase();
}

/* ---- "mvm1" keystream cipher (same family as cineby - shared helpers) ---- */

var VD_SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174
];
var VD_MAGIC_BYTES = [109, 118, 109, 49]; // "mvm1"
var VD_BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vdFmix32(h) {
  h = h >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function vdRotl32(x, n) {
  x = x >>> 0;
  n &= 31;
  if (n === 0) return x >>> 0;
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function vdFnv1a32(text) {
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return vdFmix32(hash);
}

function vdBase64UrlToBytes(text) {
  var normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  var raw = "";
  try { if (typeof atob === "function") raw = atob(normalized); } catch (e) { raw = ""; }
  if (!raw) {
    var stripped = "";
    for (var s = 0; s < text.length; s++) {
      var ch = text.charAt(s);
      if (ch !== "=" && VD_BASE64_CHARS.indexOf(ch) !== -1) stripped += ch;
    }
    for (var b = 0; b < stripped.length; b += 4) {
      var c1 = VD_BASE64_CHARS.indexOf(stripped.charAt(b));
      var c2 = VD_BASE64_CHARS.indexOf(stripped.charAt(b + 1));
      var c3 = b + 2 < stripped.length ? VD_BASE64_CHARS.indexOf(stripped.charAt(b + 2)) : -1;
      var c4 = b + 3 < stripped.length ? VD_BASE64_CHARS.indexOf(stripped.charAt(b + 3)) : -1;
      raw += String.fromCharCode((c1 << 2) | (c2 >> 4));
      if (c3 !== -1) raw += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
      if (c4 !== -1) raw += String.fromCharCode(((c3 & 3) << 6) | c4);
    }
  }
  var bytes = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function vdMakeKeystreamState(seedText, mediaId) {
  var slots = new Array(61);
  var state = vdFmix32(vdFnv1a32(seedText) ^ vdFmix32((mediaId >>> 0) ^ 2654435769)) >>> 0;
  for (var i = 0; i < 8; i++) {
    if ((i * (i + 1) & 1) === 0) {
      var slotIndex = state % 61;
      state = vdRotl32((state + 2654435769) >>> 0, 7 + (7 & i));
      slots[slotIndex] = (state ^ vdFmix32(state)) >>> 0;
      state = vdFmix32((state + slotIndex) >>> 0);
    } else {
      slots[i] = VD_SHA256_CONSTANTS[15 & i];
    }
  }
  return { slots: slots, acc: vdFmix32(2779096485 ^ state) >>> 0 };
}

function vdNextKeystreamWord(ks, step) {
  var slots = ks.slots;
  var acc = ks.acc;
  var idx = acc % 61;
  var missing = (idx in slots) ? -1 : 0;
  var prev = slots[idx] >>> 0;
  var mixed = (prev ^ Math.imul(2654435769, step + 1)) >>> 0;
  var comb = (((acc ^ mixed) >>> 0) | ((acc & mixed & missing) >>> 0)) >>> 0;
  var spun = vdRotl32((comb + acc) >>> 0, 31 & idx) ^ vdRotl32(acc, 31 & Math.imul(idx, 7));
  var word = vdFmix32((spun + 2654435769) >>> 0);
  slots[idx] = word >>> 0;
  ks.acc = word;
  return word >>> 0;
}

function vdGenerateKeystream(seedText, mediaId, length) {
  var ks = vdMakeKeystreamState(seedText, mediaId);
  var out = new Uint8Array(length);
  var o = 0, step = 0;
  while (o < length) {
    var word = vdNextKeystreamWord(ks, step++);
    out[o++] = word & 255;
    if (o < length) out[o++] = (word >>> 8) & 255;
    if (o < length) out[o++] = (word >>> 16) & 255;
    if (o < length) out[o++] = (word >>> 24) & 255;
  }
  return out;
}

function vdUtf8BytesToString(bytes) {
  var out = "", i = 0;
  while (i < bytes.length) {
    var b0 = bytes[i++];
    if (b0 < 128) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 224) === 192) {
      out += String.fromCharCode(((b0 & 31) << 6) | (bytes[i++] & 63));
    } else if ((b0 & 240) === 224) {
      var b1 = bytes[i++], b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 15) << 12) | ((b1 & 63) << 6) | (b2 & 63));
    } else if ((b0 & 248) === 240) {
      var u1 = bytes[i++], u2 = bytes[i++], u3 = bytes[i++];
      var cp = ((b0 & 7) << 18) | ((u1 & 63) << 12) | ((u2 & 63) << 6) | (u3 & 63);
      cp -= 65536;
      out += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023));
    } else {
      out += String.fromCharCode(b0);
    }
  }
  return out;
}

/** Decrypt a server payload; throws when the seed does not match. */
function decryptWingsPayload(payloadB64Url, seed, mediaId) {
  var cipher = vdBase64UrlToBytes(payloadB64Url);
  var keystream = vdGenerateKeystream(String(seed), mediaId, cipher.length);
  var plain = new Uint8Array(cipher.length);
  for (var i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ keystream[i];
  for (var m = 0; m < VD_MAGIC_BYTES.length; m++) {
    if (plain[m] !== VD_MAGIC_BYTES[m]) throw new Error("decrypt failed: bad seed or tampered payload");
  }
  return vdUtf8BytesToString(plain.subarray(VD_MAGIC_BYTES.length));
}

/* ---- TMDB meta ---- */

function fetchMediaDetails(tmdbId, mediaType) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var id = String(tmdbId == null ? "" : tmdbId).replace(/\D/g, "");
  var url = TMDB_BASE_URL + "/" + type + "/" + id + "?api_key=" + TMDB_API_KEY +
    "&append_to_response=external_ids";
  return __nvFetch(url, {
    headers: { "User-Agent": REQUEST_HEADERS["User-Agent"], "Accept": "application/json" }
  }).then(function (res) {
    if (!res.ok) throw new Error("TMDB HTTP " + res.status);
    return res.json().then(function (data) {
      var title = type === "tv" ? data.name : data.title;
      var date = type === "tv" ? data.first_air_date : data.release_date;
      var duration = type === "tv" ? "45 min" : "90 min";
      if (type === "movie" && data.runtime) duration = data.runtime + " min";
      if (type === "tv" && data.episode_run_time && data.episode_run_time[0]) duration = data.episode_run_time[0] + " min";
      return {
        title: title,
        year: date ? String(date).split("-")[0] : "",
        duration: duration,
        imdbId: (data.external_ids && data.external_ids.imdb_id) || "",
        mediaType: type
      };
    }).catch(function () { return null; });
  }).catch(function () { return null; });
}

/* ---- per-server fetch + row dressing ---- */

function formatServerStreams(payloadJson, serverKey, meta, season, episode) {
  var data;
  try { data = JSON.parse(payloadJson); } catch (e) { return []; }
  if (!data || typeof data !== "object") return [];

  var subHeaders = {
    "Referer": "https://www.vidking.net/",
    "Origin": "https://www.vidking.net",
    "User-Agent": USER_AGENT
  };
  var subtitles = (data.subtitles || []).map(function (s) {
    return {
      url: s.url,
      language: getLangCode(s.language || s.lang),
      name: s.language || s.lang || "English",
      headers: subHeaders
    };
  });

  var emoji = SERVER_EMOJI[serverKey] || "🎬";
  var label = SERVER_LABEL[serverKey] || serverKey;
  var audio = SERVER_AUDIO[serverKey] || ["Original Audio", "🌍 Original Audio"];

  var rows = [];
  var sources = data.sources || [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    if (!src || !src.url) continue;

    var quality = src.quality || "1080p";
    quality = quality.replace(/\s*server\s*2\s*$/gi, "").trim();
    if (serverKey === "Oxygen") quality = "Auto";

    var qEmoji = "⚡ " + quality;
    var qLower = quality.toLowerCase();
    if (qLower.indexOf("2160") !== -1 || qLower.indexOf("4k") !== -1) qEmoji = "🌟 2160p";
    else if (qLower.indexOf("1080") !== -1) qEmoji = "🔥 1080p";
    else if (qLower.indexOf("720") !== -1) qEmoji = "⚡ 720p";
    else if (qLower === "auto") qEmoji = "⚡ Auto";

    var format = src.url.indexOf(".m3u8") !== -1 ? "M3U8" : (src.url.indexOf(".mp4") !== -1 ? "MP4" : "MKV");
    var withEpisode = meta.title + (meta.mediaType === "tv" ? " S" + season + "E" + episode : "");
    var serverName = serverKey === "Krypton" ? serverKey.replace(/\s*(1080p\s+)?server\s*2\s*$/gi, "").trim() : serverKey;
    var title = "🎬 " + withEpisode + " - (" + meta.year + ")\n" +
      qEmoji + " | " + audio[1] + " | 🎧 AAC\n" +
      "🎞️ " + format + " | ⏱️ " + meta.duration + "\n" +
      emoji + " " + serverName + " | 🔗 Provider: " + label;

    rows.push({
      name: "VidEasy | " + quality + " | " + audio[0],
      title: title,
      size: title,
      description: title,
      url: src.url,
      quality: quality === "Auto" ? "Auto" : quality,
      headers: subHeaders,
      subtitles: subtitles
    });
  }
  return rows;
}

function fetchFromWingsServer(serverKey, serverConf, mediaType, tmdbId, meta, seed, season, episode) {
  var params = {
    title: meta.title,
    mediaType: mediaType,
    year: String(meta.year),
    episodeId: String(episode || 1),
    seasonId: String(season || 1),
    tmdbId: String(tmdbId),
    imdbId: meta.imdbId || "",
    enc: "2",
    seed: seed
  };
  var query = [];
  for (var k in params) {
    if (params[k] !== undefined) query.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
  }
  var url = WINGS_API_BASE + "/" + serverConf.path + "?" + query.join("&");

  return __nvFetch(url, { headers: REQUEST_HEADERS }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text().then(function (body) {
      if (!body || !body.trim()) throw new Error("Empty response");
      var plain = decryptWingsPayload(body, seed, Number(tmdbId));
      var rows = formatServerStreams(plain, serverKey, meta, season, episode);
      console.log("[VidEasy] " + serverKey + ": " + rows.length + " stream(s)");
      return rows;
    }).catch(function (e) {
      console.warn("[VidEasy] " + serverKey + " parse: " + e.message);
      return [];
    });
  }).catch(function (e) {
    console.warn("[VidEasy] " + serverKey + ": " + e.message);
    return [];
  });
}

/* ---- entry: meta -> seed -> 10-server fan, 9s partial collect ---- */

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[VidEasy] start " + mediaType + " " + tmdbId +
    (mediaType === "tv" ? " S:" + season + "E:" + episode : ""));
  return fetchMediaDetails(tmdbId, mediaType).then(function (meta) {
    if (!meta || !meta.title) {
      console.error("[VidEasy] TMDB meta failed");
      return [];
    }
    var seedUrl = WINGS_API_BASE + "/seed?mediaId=" + encodeURIComponent(String(tmdbId).replace(/\D/g, ""));
    return __nvFetch(seedUrl, { headers: REQUEST_HEADERS }).then(function (res) {
      if (!res.ok) throw new Error("Seed HTTP " + res.status);
      return res.json().then(function (seedData) {
        var seed = seedData && seedData.seed;
        if (!seed) throw new Error("No seed returned from API");

        var lanes = [];
        for (var key in SERVERS) {
          if (Object.prototype.hasOwnProperty.call(SERVERS, key)) {
            lanes.push(fetchFromWingsServer(key, SERVERS[key], mediaType, tmdbId, meta, seed, season, episode));
          }
        }

        var collected = [];
        var push = function (rows) { if (Array.isArray(rows)) collected = collected.concat(rows); };
        lanes.forEach(function (p) { p.then(push).catch(function () {}); });

        var settled = typeof setTimeout === "function"
          ? Promise.race([
              Promise.all(lanes),
              new Promise(function (r) {
                var t = setTimeout(function () { r(1); }, 9000);
                if (t && typeof t.unref === "function") t.unref();
              })
            ])
          : Promise.all(lanes);

        return settled.then(function () {
          var seen = {}, out = [];
          for (var i = 0; i < collected.length; i++) {
            var r = collected[i];
            if (r && r.url && !seen[r.url]) { seen[r.url] = 1; out.push(r); }
          }
          console.log("[VidEasy] total unique streams: " + out.length);
          return out;
        });
      }).catch(function (e) { console.error("[VidEasy] seed json: " + e.message); return []; });
    }).catch(function (e) { console.error("[VidEasy] seed: " + e.message); return []; });
  }).catch(function (e) {
    console.error("[VidEasy] error: " + e.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };

/* ===== nvio light deadline wrapper (12s) =================================
   Bounds the provider's total runtime so the stream sheet is never held
   past ~9s (AIO parity). No filtering: rows pass through unchanged.
   Opt-out: set SCRAPER_SETTINGS.postFilter = false. ==================== */
(function() {
  var G = typeof globalThis !== "undefined" ? globalThis : this;
  try {
    var __orig = module.exports && module.exports.getStreams;
    if (typeof __orig !== "function") return;
    module.exports.getStreams = function() {
      var args = arguments,
        self = this;

      function timed() {
        var base = Promise.resolve(__orig.apply(self, args))
          .then(function(rows) {
            return Array.isArray(rows) ? rows : [];
          })
          .catch(function() {
            return [];
          });
        if (typeof setTimeout !== "function") return base; /* device: no timers */
        return Promise.race([
          base,
          new Promise(function(res) {
            var t = setTimeout(function() {
              res([]);
            }, 20000);
            if (typeof t === "object" && typeof t.unref === "function") t.unref();
          })
        ]).catch(function() {
          return [];
        });
      }
      try {
        var pf = G.SCRAPER_SETTINGS && G.SCRAPER_SETTINGS.postFilter;
        if (pf === false) return Promise.resolve(__orig.apply(self, args)).catch(function() {
          return [];
        });
      } catch (e) {}
      return timed();
    };
  } catch (e) {}
})();
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
(function() {
  'use strict';

  var WINGS_BASE = 'https://api.speedracelight.com';
  var TMDB_KEY = '439c478a771f35c05022f9feabcca01c';
  var WINGS_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
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
  var SHA_C = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174
  ];

  function _f(x) {
    x = x >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x;
  }

  function _rotl(x, n) {
    x = x >>> 0;
    n = n & 31;
    if (n === 0) return x >>> 0;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function _branch(n) {
    return ((n * (n + 1)) & 1) === 0;
  }

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
    return {
      slots: slots,
      acc: _f((0xa5a5a5a5 ^ s) >>> 0) >>> 0
    };
  }

  function _next(state, counter) {
    var slots = state.slots,
      acc = state.acc;
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
      for (var q = 0; q < s.length; q++) {
        var c = s.charAt(q);
        if (c !== '=' && CH.indexOf(c) !== -1) clean += c;
      }
      bin = '';
      for (var w = 0; w < clean.length; w += 4) {
        var a = CH.indexOf(clean.charAt(w)),
          b = CH.indexOf(clean.charAt(w + 1));
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
      else if ((b & 0xf0) === 0xe0) s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) <<
        6) | (bytes[i++] & 0x3f));
      else if ((b & 0xf8) === 0xf0) {
        var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[
          i++] & 0x3f);
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
      return Promise.resolve(p).then(function(v) {
        return v;
      }, function() {
        return fallback;
      });
    }
    return new Promise(function(resolve) {
      var done = false;
      var t = setTimeout(function() {
        if (!done) {
          done = true;
          resolve(fallback);
        }
      }, ms);
      if (t && typeof t.unref === 'function') t.unref();
      Promise.resolve(p).then(function(v) {
          if (!done) {
            done = true;
            clearTimeout(t);
            resolve(v);
          }
        },
        function() {
          if (!done) {
            done = true;
            clearTimeout(t);
            resolve(fallback);
          }
        });
    });
  }

  function _jsonText(resp) {
    return Promise.resolve(resp.text()).catch(function() {
      return '';
    });
  }

  function wingsTmdbMeta(tmdbId, mediaType) {
    var url = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' +
      parseInt(tmdbId, 10) + '?api_key=' + TMDB_KEY + '&append_to_response=external_ids';
    return _race(
      _fetchX(url, {
        headers: {
          'User-Agent': WINGS_UA,
          'Accept': 'application/json'
        }
      })
      .then(function(r) {
        return r.ok ? r.json() : null;
      })
      .then(function(j) {
        if (!j) return null;
        return {
          title: mediaType === 'tv' ? j.name : j.title,
          year: ((mediaType === 'tv' ? j.first_air_date : j.release_date) || '').substring(0, 4),
          imdbId: (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || ''
        };
      }),
      6000, null);
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
    return _fetchX(WINGS_BASE + '/' + serverPath + '?' + params, {
        headers: WINGS_HEADERS
      })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(txt) {
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
      return wingsTmdbMeta(tmdbId, mediaType).then(function(meta) {
        if (!meta || !meta.title) return [];
        return _fetchX(WINGS_BASE + '/seed?mediaId=' + tmdbId, {
            headers: WINGS_HEADERS
          })
          .then(function(r) {
            if (r.ok) return r.json();
            if (r.status === 429 || r.status === 503) {
              /* seed endpoint rate-limits bursts; on the serialized device bridge
                 the immediate retry lands past the burst window */
              return _fetchX(WINGS_BASE + '/seed?mediaId=' + tmdbId, {
                  headers: WINGS_HEADERS
                })
                .then(function(r2) {
                  return r2.ok ? r2.json() : null;
                }, function() {
                  return null;
                });
            }
            return null;
          })
          .then(function(j) {
            if (!j || !j.seed) throw new Error('no seed');
            var seed = j.seed;
            var jobs = WINGS_SERVERS.map(function(sp) {
              return wingsQueryServer(sp, seed, meta, mediaType, opts.season, opts.episode,
                  tmdbId)
                .then(function(o) {
                  return o;
                }, function() {
                  return null;
                });
            });
            /* collect PARTIAL results: never gate on the slowest server.
             * undefined = still pending, null = failed, object = success. */
            return new Promise(function(resolve) {
              var results = new Array(jobs.length);
              var done = false;
              var t = null;
              if (typeof setTimeout === 'function') {
                /* device QuickJS ships no timers - guard every timer use */
                t = setTimeout(function() {
                  if (!done) {
                    done = true;
                    resolve(results);
                  }
                }, Math.max(6000, timeoutMs - 2500));
                if (t && typeof t.unref === 'function') t.unref();
              }
              var pending = jobs.length;
              var settle = function() {
                if (!done) {
                  done = true;
                  if (t) clearTimeout(t);
                  resolve(results);
                }
              };
              jobs.forEach(function(jp, idx) {
                Promise.resolve(jp).then(function(obj) {
                  results[idx] = obj;
                  pending--;
                  if (pending <= 0) settle();
                }, function() {
                  results[idx] = null;
                  pending--;
                  if (pending <= 0) settle();
                });
              });
            }).then(function(results) {
              results = results || [];
              var seen = {};
              var rows = [];
              for (var i = 0; i < results.length; i++) {
                var obj = results[i];
                if (!obj) continue;
                var subs = (obj.subtitles || []).filter(function(s) {
                    return s && s.url;
                  })
                  .map(function(s) {
                    return {
                      url: s.url,
                      language: s.lang || s.language || 'en',
                      name: s.language || s.lang || 'English'
                    };
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
                    title: label + ' ' + q + (mediaType === 'tv' ? ' S' + (opts.season || 1) +
                      'E' + (opts.episode || 1) : ''),
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
              rows.sort(function(a, b) {
                var order = {
                  '4K': 4,
                  '1440p': 3,
                  '1080p': 2,
                  '720p': 1
                };
                return (order[b.quality] || 0) - (order[a.quality] || 0);
              });
              return rows;
            });
          });
      }).catch(function() {
        return [];
      });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  if (typeof globalThis !== 'undefined') globalThis.__nvWingsStreams = __nvWingsStreams;
})();

/* ===== nv-plugins device waterfall merge v2.0.0 (pack 4.37.0, 2026-09-14) ======
   Device truth (NuvioMobile PluginRuntime.kt + quickjs-kt 1.0.5-nuvio AAR):
   no timers in the realm (every Promise.race cap was inert or threw
   ReferenceError), each fetch is one BLOCKING host call (lanes run
   sequentially regardless of Promise.all), app kills the call at 60s. The
   old 4.33.0 merge ran BOTH lanes on every call and its cap() called
   setTimeout DIRECTLY -> the whole provider rejected -> 0 rows.
   v2.0.0: sequential waterfall bounded by fetch count, fail-soft both lanes.
     __WINGS_FIRST = false : native first, WINGS lane as fallback
   ========================================================================== */
(function() {
  'use strict';
  var __LABEL = 'VidEasy';
  var __WINGS_FIRST = false;
  var __ALT_NAME = '__nvWingsStreams';

  function __junk(u) {
    return /tungtungtungsahur\.cfd|\/api\?d=/i.test(String(u || ''));
  }
  var __orig = null;
  try {
    __orig = module.exports && module.exports.getStreams;
  } catch (e) {
    __orig = null;
  }
  if (typeof __orig !== 'function') return;

  function runAlt(args, self) {
    var f = null;
    try {
      f = (typeof globalThis !== 'undefined' && globalThis) ? globalThis[__ALT_NAME] : null;
    } catch (e) {
      f = null;
    }
    if (typeof f !== 'function') return Promise.resolve([]);
    try {
      var r = f({
        tmdbId: args[0],
        mediaType: args[1],
        season: args[2],
        episode: args[3],
        label: __LABEL
      });
      return Promise.resolve(r).then(function(v) {
        return Array.isArray(v) ? v : [];
      }, function() {
        return [];
      });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  function runNative(args, self) {
    try {
      var r = __orig.apply(self, args);
      return Promise.resolve(r).then(function(v) {
        return Array.isArray(v) ? v : [];
      }, function() {
        return [];
      });
    } catch (e) {
      return Promise.resolve([]);
    }
  }
  module.exports.getStreams = function() {
    var args = Array.prototype.slice.call(arguments),
      self = this;

    function clean(v) {
      var seen = {},
        out = [];
      (v || []).forEach(function(r) {
        if (!r || !r.url || __junk(r.url)) return;
        var k = String(r.url);
        if (seen[k]) return;
        seen[k] = 1;
        out.push(r);
      });
      return out;
    }

    function laneA() {
      return __WINGS_FIRST ? runAlt(args, self) : runNative(args, self);
    }

    function laneB() {
      return __WINGS_FIRST ? runNative(args, self) : runAlt(args, self);
    }
    return Promise.resolve().then(laneA).then(function(rows) {
      rows = clean(rows);
      if (rows.length) return rows;
      return Promise.resolve().then(laneB).then(function(rows2) {
        return clean(rows2);
      });
    });
  };
})();
