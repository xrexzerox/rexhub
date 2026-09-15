/* nv-plugins fibwatch.js v5.0.0 (pack 4.40.0 "all providers readable")
 * Full clean rebuild; regex-only HTML parsing (the 4.39 build's
 * require("cheerio-without-node-native") could never load on the device
 * realm and silently zeroed every call). Single native lane, no WINGS.
 * Post-filter (>=720p, en/tl gate, dedupe) appended below.
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
 * nv-plugins fibwatch.js v5.0.0 (pack 4.40.0 "all providers readable")
 * ------------------------------------------------------------
 * Clean readable rebuild of the FibWatch native lane. The 4.39 build
 * depended on require("cheerio-without-node-native") - unavailable in
 * the Nuvio QuickJS realm, so every cheerio.load() site died to a
 * ReferenceError and the provider silently returned 0 rows on device.
 * v5.0.0 replaces all HTML parsing with plain regex extraction.
 *
 * Flow: TMDB meta -> GET fibwatch.art/search?keyword={title}&page_id=1
 *   -> pick matching div.video-thumb result -> detail page -> input
 *   #video-id -> (tv: /ajax/episodes.php -> SxxEyy match -> episode
 *   page -> #video-id) -> /ajax/resolution_switcher.php?video_id= ->
 *   {current[],popup[]} entries -> direct .mp4/.mkv/.m3u8 rows, or
 *   shortener page -> hidden-button / url=http / b-cdn.net extraction.
 * Device notes: regex-only parsing (no cheerio), timer-guarded
 *   __nvFetch, entry fan-out capped at 6, response.ok checked,
 *   fail-soft everywhere, nvio post-filter tail.
 * ============================================================ */

var BASE_URL = "https://fibwatch.art";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var BROWSER_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
var HEADERS = { "User-Agent": BROWSER_UA, "Referer": BASE_URL + "/" };
var PLAYBACK_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Referer": "https://urlshortlink.top/",
  "Origin": "https://urlshortlink.top"
};
var MAX_LINK_ENTRIES = 6; // fan-out bound: shortener pages cost one fetch each

function extractQuality(text) {
  var s = String(text || "").toLowerCase();
  if (s.indexOf("2160") !== -1 || s.indexOf("4k") !== -1) return "4K";
  if (s.indexOf("1080") !== -1) return "1080p";
  if (s.indexOf("720") !== -1) return "720p";
  if (s.indexOf("480") !== -1) return "480p";
  if (s.indexOf("360") !== -1) return "360p";
  return "Unknown";
}

/** Pull the watch page's hidden video id out of either attribute order. */
function extractVideoId(html) {
  var m = html.match(/<input[^>]*id="video-id"[^>]*value="([^"]*)"/i) ||
    html.match(/<input[^>]*value="([^"]*)"[^>]*id="video-id"/i);
  return m ? m[1] : null;
}

/**
 * Search results: one regex per div.video-thumb block, then the anchor
 * href + title tag inside it (replaces the old cheerio each() walk).
 */
function parseSearchResults(html) {
  var results = [];
  var blockRe = /<div[^>]*class="[^"]*video-thumb[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*video-thumb[^"]*"|<footer|<\/body>)/gi;
  var block;
  while ((block = blockRe.exec(html)) !== null) {
    var inner = block[1] || "";
    var hrefM = inner.match(/<a[^>]*href="([^"]+)"/i);
    if (!hrefM) continue;
    var tagM = inner.match(/<p[^>]*class="[^"]*hptag[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    var altM = inner.match(/<img[^>]*alt="([^"]*)"/i);
    var title = tagM ? tagM[1].replace(/<[^>]*>/g, "").trim() : (altM ? altM[1] : "");
    results.push({ title: title, url: hrefM[1] });
  }
  return results;
}

/**
 * Shortener page -> real stream URL. Preference order (same as 4.39):
 * a.hidden-button.buttonDownloadnew href, any a[href*="url=http"],
 * then a bare .b-cdn.net media file link in the page text.
 */
function parseStreamFromShortenerHtml(html) {
  if (!html) return null;
  var m = html.match(/<a[^>]*class="[^"]*hidden-button[^"]*buttonDownloadnew[^"]*"[^>]*href="([^"]*)"/i);
  if (!m) m = html.match(/<a[^>]*class="[^"]*buttonDownloadnew[^"]*hidden-button[^"]*"[^>]*href="([^"]*)"/i);
  if (!m) {
    var anchors = html.match(/<a[^>]*href="([^"]*url=http[^"]*)"/gi) || [];
    for (var i = 0; i < anchors.length; i++) {
      var hm = anchors[i].match(/href="([^"]*)"/i);
      if (hm) { m = hm; break; }
    }
  }
  if (!m) {
    var cdn = html.match(/https?:\/\/[^\s"'`<>]+?\.b-cdn\.net\/[^\s"'`<>]+\.(?:mkv|mp4|m3u8)/i);
    if (cdn) return cdn[0];
    return null;
  }
  var wrapped = m[1].replace(/.*url=/, "").trim();
  try { return decodeURIComponent(wrapped); } catch (e) { return wrapped; }
}

/** Row dressing (same labels the 4.39 build served). */
function buildFibwatchRow(url, quality, meta, isTv, season, episode) {
  var title = meta.title || meta.name || "Unknown Title";
  var date = meta.release_date || meta.first_air_date || "";
  var year = date ? date.split("-")[0] : "N/A";
  var src = String(url).toLowerCase();

  var audioMode = "Single-Audio", audioLang = "Hindi";
  if (src.indexOf("dual") !== -1 || (src.indexOf("hindi") !== -1 && src.indexOf("english") !== -1)) {
    audioMode = "Dual-Audio"; audioLang = "English • Hindi";
  } else if (src.indexOf("multi") !== -1) {
    audioMode = "Multi-Audio"; audioLang = "Multilingual";
  } else if (src.indexOf("bangla") !== -1) {
    audioLang = "Bangla";
  } else if (src.indexOf("tamil") !== -1) {
    audioLang = "Tamil";
  } else if (src.indexOf("telugu") !== -1) {
    audioLang = "Telugu";
  } else if (src.indexOf("english") !== -1) {
    audioMode = "Single-Audio"; audioLang = "English";
  }

  var format = "MKV";
  if (src.indexOf(".mp4") !== -1) format = "MP4";
  if (src.indexOf(".m3u8") !== -1) format = "M3U8 / HLS";

  var runtime = "N/A";
  if (isTv) runtime = (meta.episode_run_time && meta.episode_run_time[0]) ? meta.episode_run_time[0] + " min" : "45 min";
  else if (meta.runtime) runtime = meta.runtime + " min";

  var badge = (quality.indexOf("4K") !== -1 || quality.indexOf("2160") !== -1) ? "🌟" : "💎";
  var name = "⚫ FibWatch | " + quality + " | " + audioMode;
  var line1 = isTv ? "🎬 " + title + " - S" + season + "E" + episode + " (" + year + ")" : "🎬 " + title + " - " + year;
  var line2 = badge + " " + quality + " | 🌍 " + audioLang;
  var line3 = "🎞️ " + format + " | ⏱️ " + runtime + " | 📌 WEB-DL";

  return {
    name: name,
    title: line1 + "\n" + line2 + "\n" + line3,
    url: url,
    quality: quality,
    behaviorHints: { notWebReady: false },
    headers: PLAYBACK_HEADERS
  };
}

/** Resolve one resolution_switcher entry (direct file or shortener hop). */
function resolveEntry(entry, baseUrl, collected) {
  var url = String((entry && entry.url) || "").trim();
  if (!url) return Promise.resolve();
  if (url.indexOf("http") !== 0) url = baseUrl + url;
  var quality = extractQuality(entry.res || url);

  if (url.match(/\.(mp4|mkv|m3u8)/i)) {
    collected.push({ url: url, quality: quality });
    return Promise.resolve();
  }
  return __nvFetch(url, { headers: HEADERS }).then(function (res) {
    if (!res.ok) return;
    return res.text().then(function (html) {
      var streamUrl = parseStreamFromShortenerHtml(html);
      if (streamUrl && streamUrl.indexOf("http") === 0) {
        var q = extractQuality(streamUrl) !== "Unknown" ? extractQuality(streamUrl) : quality;
        collected.push({ url: streamUrl, quality: q });
      }
    }).catch(function () {});
  }).catch(function () {});
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var metaUrl = "https://api.themoviedb.org/3/" + type + "/" + encodeURIComponent(tmdbId) + "?api_key=" + TMDB_API_KEY;
  return __nvFetch(metaUrl).then(function (res) {
    if (!res.ok) return [];
    return res.json().then(function (meta) {
      var title = meta.title || meta.name;
      if (!title) return [];

      var searchUrl = BASE_URL + "/search?keyword=" + encodeURIComponent(title) + "&page_id=1";
      return __nvFetch(searchUrl, { headers: HEADERS }).then(function (res2) {
        if (!res2.ok) return [];
        return res2.text().then(function (searchHtml) {
          var candidates = parseSearchResults(searchHtml);
          if (!candidates.length) return [];

          var needle = title.toLowerCase();
          var pick = null;
          for (var i = 0; i < candidates.length; i++) {
            if ((candidates[i].title || "").toLowerCase().indexOf(needle) !== -1) { pick = candidates[i]; break; }
          }
          if (!pick) pick = candidates[0];
          var detailUrl = pick.url.indexOf("http") === 0 ? pick.url : BASE_URL + pick.url;

          return __nvFetch(detailUrl, { headers: HEADERS }).then(function (res3) {
            if (!res3.ok) return [];
            return res3.text().then(function (detailHtml) {
              var videoId = extractVideoId(detailHtml);
              if (!videoId) return [];

              var loadEntries = function (videoKey) {
                var swUrl = BASE_URL + "/ajax/resolution_switcher.php?video_id=" + encodeURIComponent(videoKey);
                return __nvFetch(swUrl, { headers: HEADERS }).then(function (r) {
                  if (!r.ok) return [];
                  return r.json().then(function (j) {
                    return [].concat(j.current || [], j.popup || []);
                  }).catch(function () { return []; });
                }).catch(function () { return []; });
              };

              var entriesP;
              if (type === "tv") {
                var epsUrl = BASE_URL + "/ajax/episodes.php?video_id=" + encodeURIComponent(videoId);
                entriesP = __nvFetch(epsUrl, { headers: HEADERS }).then(function (r) {
                  if (!r.ok) return [];
                  return r.json().then(function (j) {
                    var episodes = j.episodes || [];
                    if (!episodes.length) return [];
                    var wantS = parseInt(season, 10), wantE = parseInt(episode, 10);
                    var target = "";
                    for (var e = 0; e < episodes.length; e++) {
                      var m = String(episodes[e].title || "").toLowerCase().match(/s(\d{1,2})e(\d{1,3})/);
                      if (m && parseInt(m[1], 10) === wantS && parseInt(m[2], 10) === wantE) {
                        target = episodes[e].url || "";
                        break;
                      }
                    }
                    if (!target) target = episodes[0].url || ""; // 4.39 fallback
                    if (!target) return [];
                    if (target.indexOf("http") !== 0) target = BASE_URL + target;
                    return __nvFetch(target, { headers: HEADERS }).then(function (r2) {
                      if (!r2.ok) return [];
                      return r2.text().then(function (epHtml) {
                        var epVideoId = extractVideoId(epHtml);
                        return epVideoId ? loadEntries(epVideoId) : [];
                      }).catch(function () { return []; });
                    }).catch(function () { return []; });
                  }).catch(function () { return []; });
                }).catch(function () { return []; });
              } else {
                entriesP = loadEntries(videoId);
              }

              return entriesP.then(function (entries) {
                var collected = [];
                var queue = entries.slice(0, MAX_LINK_ENTRIES);
                var run = function (idx) {
                  if (idx >= queue.length) return Promise.resolve();
                  return resolveEntry(queue[idx], BASE_URL, collected).then(function () { return run(idx + 1); });
                };
                return run(0).then(function () {
                  var rows = [];
                  for (var c = 0; c < collected.length; c++) {
                    rows.push(buildFibwatchRow(collected[c].url, collected[c].quality, meta, type === "tv", season, episode));
                  }
                  return rows;
                });
              });
            }).catch(function () { return []; });
          }).catch(function () { return []; });
        }).catch(function () { return []; });
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
  var PROVIDER = "fibwatch";
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
