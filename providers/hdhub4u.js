/* nv-plugins hdhub4u.js v5.0.0 (pack 4.40.0 "all providers readable, no device killer")
 * Clean readable port of Eclipsia (codeberg eclipsia/nuvio-plugin) "Hexion." = 4kHdHub,
 * replacing the machine-renamed (_0x) 4.39 build. Flow: TMDB meta -> WP imdb search
 * (wp-json) -> keyword HTML search -> pingora typesense lane -> post page -> hubcloud
 * drive links -> hubcloud.php resolver -> FSL-v2/FSL/Worker/PixelDrain direct links.
 * Endpoint diffs vs Eclipsia (current 4.39 URLs preferred, device-verified):
 *   domains https://new1.hdhub4u.cl (302 -> new5.hdhub4u.cl) + rotation json
 *   raw.githubusercontent.com/phisher98/TVVVV/.../domains.json + pingora search
 *   search.pingora.fyi kept from 4.39; Eclipsia base https://4khdhub.one kept as
 *   sequential fallback candidate (also alive; same WP theme + hubcloud fleet).
 *   TMDB key 439c478a771f35c05022f9feabcca01c (pack key; hexion shipped its own).
 * Device notes: preamble polyfills (atob/btoa/URLSearchParams), 8s __nvFetch
 *   deadline, sequential domain probes (max 3, cached) + sequential hubcloud
 *   resolves (max 8 links, early exit at 6 streams), no require/cheerio/TextDecoder,
 *   no raw timers. Eclipsia settings UI dropped; 480p dropped at extraction and the
 *   nvio post-filter (>=720p, en/tl gate, dedupe) + waterfall appended below.
 *   Rows: "4kHdHub - <quality> - <size>" (4.39 naming not extractable: obfuscated).
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
/* nv-plugins best-settings pass 4.23.0 (kept from 4.39): hard 8s deadline on every
   network call. Exposed as __nvFetch so the WINGS lane and the nvio post-filter
   probe reuse the same bounded fetch. Timer-guarded: the device QuickJS realm
   ships no setTimeout, in which case the plain fetch promise is returned. */
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

"use strict";

/* ---------- 4kHdHub (hexion) constants ----------
 * Domain order mirrors the pack: the 4.39 device-verified hdhub4u.cl host
 * first (it 302s new1 -> new5 on the device network), then Eclipsia's
 * original 4khdhub.one. The winner is cached for the session.
 */
var PROVIDER_NAME = "4kHdHub";
var TMDB_API_URL = "https://api.themoviedb.org/3";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; /* pack key (4.39); Eclipsia hexion shipped its own */
var DOMAINS_JSON_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json"; /* 4.39 rotation source */
var DOMAIN_FALLBACKS = ["https://new1.hdhub4u.cl", "https://4khdhub.one"];
var PINGORA_SEARCH_URL = "https://search.pingora.fyi/collections/post/documents/search?q="; /* 4.39 search lane */

var MOBILE_UAS = [
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];
var sessionUA = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];

/* Device budget: hard caps instead of unbounded link fan-out
 * (the 4.39 4khdhub blowout fix: sequential resolves, early exit). */
var MAX_DOMAIN_PROBES = 3;
var MAX_LINKS = 8;
var MAX_STREAMS = 6;

var RE_QUALITY = /(2160|1080|720|480)p|(4K|UHD)/i;
var RE_YEAR = /\b(19\d{2}|20\d{2})\b/;
var RE_SIZE_CTX = /(?:^|[\s>])(\d+\.?\d*)\s*(GB|MB)\b/i;
var RE_HUBCLOUD = /https?:\/\/hubcloud\.[a-z0-9]+\/drive\/[a-z0-9]+/ig;
/* hdhub4u.cl family hops one level wider than 4khdhub.one: post pages link
 * out to hubdrive.sbs file pages (which embed the hubcloud drive link) and
 * sometimes straight to hubcdn.lol redirectors (?r=base64 -> link=<direct>). */
var RE_HUBDRIVE = /https?:\/\/hubdrive\.[a-z0-9]+\/file\/[a-z0-9]+/ig;
var RE_HUBCDN = /https?:\/\/hubcdn\.[a-z0-9]+\/file\/[a-z0-9]+/ig;
var RE_SXEX = /S0*(\d+)[.\s_\-]*E0*(\d+)/i;
var RE_EP = /Episode\s*0*(\d+)/i;
var RE_HEADER = /<div[^>]*class=['"][^'"]*card-header[^'"]*['"][^>]*>([^<]+)</i;
var RE_SIZE_TD = /<td[^>]*>\s*File\s*Size\s*:\s*<\/td>\s*<td[^>]*>\s*([\d\.]+\s*[MGBtbi]+)\s*<\/td>/i;
var RE_SIZE_STR = /Size\s*:\s*<\/strong>\s*([\d\.]+\s*[MGBtbi]+)/i;
var RE_SLUG_JUNK = /^(movie|series)$|^\d+$/;
var RE_NONALNUM = /[^a-z0-9]/g;
var RE_EXT = /\.(mkv|mp4|avi|rar|zip)$/i;
var RE_ZIP_RAR = /\.zip|\.rar/;
var RE_PIXEL = /pixel\.hubcloud/;
var RE_PXL_VAR = /var\s+pxl\s*=\s*["']https?:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i;
var RE_PXL_HREF = /href=["']https?:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i;

var AUDIO_TABLE = [
  [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
  [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
  [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
  [/ddp.?51/i, "DDP 5.1"],
  [/truehd/i, "TrueHD 7.1"],
  [/aac.*71|71.*aac/i, "AAC 7.1"],
  [/aac/i, "AAC 5.1"],
];

function getHeaders(extra) {
  return Object.assign({
    "User-Agent": sessionUA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }, extra || {});
}

/* Every fetch goes through __nvFetch (8s deadline, timer-guarded), checks
 * response.ok, and fails soft to null. */
async function fetchText(url, options) {
  try {
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign(getHeaders(), opts.headers || {});
    var res = await __nvFetch(url, opts);
    if (!res || !res.ok) return null;
    var t = await res.text();
    return t || null;
  } catch (_) { return null; }
}

async function fetchJson(url, options) {
  try {
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign(getHeaders(), opts.headers || {});
    var res = await __nvFetch(url, opts);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

function parseSizeMB(sizeStr) {
  if (!sizeStr) return null;
  var m = /(\d+\.?\d*)\s*(GB|MB)/i.exec(String(sizeStr));
  if (!m) return null;
  var val = parseFloat(m[1]);
  return m[2].toUpperCase() === "GB" ? val * 1024 : val;
}

function calcMbps(sizeMB, runtimeMinutes) {
  if (!sizeMB || !runtimeMinutes) return null;
  var bits = sizeMB * 1024 * 1024 * 8;
  var seconds = runtimeMinutes * 60;
  return (bits / seconds / 1000000).toFixed(1) + " Mbps";
}

/* ---------- session domain resolution (capped, cached) ---------- */
var activeDomain = null;

async function probeDomain(base) {
  /* /?s= probe: the WP REST route is 404-disabled on 4khdhub.one, the search
   * page answers on both site families (CF-blocked hosts fail here -> next) */
  var t = await fetchText(base + "/?s=a");
  return !!t;
}

async function getActiveDomain() {
  if (activeDomain) return activeDomain;
  var candidates = [];
  /* freshest domain from the rotation json the 4.39 file used (1 fetch) */
  var j = await fetchJson(DOMAINS_JSON_URL);
  if (j) {
    var d = j["HDHUB4u"] || j["4khdhub"] || j["hdhub4u"];
    if (d && /^https?:\/\//i.test(d)) candidates.push(String(d).replace(/\/+$/, ""));
  }
  for (var i = 0; i < DOMAIN_FALLBACKS.length; i++) {
    if (candidates.indexOf(DOMAIN_FALLBACKS[i]) < 0) candidates.push(DOMAIN_FALLBACKS[i]);
  }
  for (var k = 0; k < candidates.length && k < MAX_DOMAIN_PROBES; k++) {
    var ok = await probeDomain(candidates[k]); /* sequential probes, early exit */
    if (ok) { activeDomain = candidates[k]; return activeDomain; }
  }
  activeDomain = candidates[0] || DOMAIN_FALLBACKS[0];
  return activeDomain;
}

/* ---------- TMDB ---------- */
async function getTMDBInfo(tmdbId, type) {
  var isTV = type === "tv";
  var title = "", year = "", imdbId = "", runtime = null;
  try {
    if (isTV) {
      var d = await fetchJson(TMDB_API_URL + "/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids");
      if (d) {
        title = d.name || "";
        year = (d.first_air_date || "").slice(0, 4);
        imdbId = (d.external_ids && d.external_ids.imdb_id) || "";
        runtime = (d.episode_run_time && d.episode_run_time[0]) || null;
      }
    } else {
      var d2 = await fetchJson(TMDB_API_URL + "/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY);
      if (d2) {
        title = d2.title || "";
        year = (d2.release_date || "").slice(0, 4);
        imdbId = d2.imdb_id || "";
        runtime = d2.runtime != null ? d2.runtime : null;
      }
    }
  } catch (_) { }
  return { title: title, year: year, imdbId: imdbId, runtime: runtime };
}

/* ---------- site search (3 fail-soft paths, 1 fetch each) ---------- */
async function searchSite(title, year, imdbId, isSeries, base) {
  /* path 1: exact imdb search over the WP API */
  if (imdbId) {
    var posts = await fetchJson(base + "/wp-json/wp/v2/posts?search=" + encodeURIComponent(imdbId));
    if (posts && posts.length > 0) {
      return {
        url: posts[0].link,
        title: (posts[0].title && posts[0].title.rendered) || title,
        content: isSeries ? null : ((posts[0].content && posts[0].content.rendered) || ""),
      };
    }
  }

  /* path 2: keyword HTML search (slug score like hexion; relaxed 2nd pass for
   * the hdhub4u.cl slug scheme which differs from 4khdhub.one) */
  var html = await fetchText(base + "/?s=" + encodeURIComponent(title));
  if (html) {
    var found = scrapeSearchHtml(html, title, year, isSeries, base, false) ||
      scrapeSearchHtml(html, title, year, isSeries, base, true);
    if (found) return found;
  }

  /* path 3: pingora typesense lane (device-verified endpoint + anti-bot
   * Cookie: xla=s4t / Edg UA header set extracted from the 4.39 file; the
   * site's own WP search does not surface newest posts) */
  var day = new Date().toISOString().split("T")[0];
  var pingora = PINGORA_SEARCH_URL + encodeURIComponent(title) +
    "&query_by=post_title,category&query_by_weights=4,2&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1&analytics_tag=" + day;
  var pingoraHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Cookie": "xla=s4t",
    "Referer": base + "/",
    "Accept": "application/json",
  };
  var data = await fetchJson(pingora, { headers: pingoraHeaders });
  if (data && data.hits && data.hits.length) {
    var cleanQ = title.toLowerCase().replace(RE_NONALNUM, "");
    for (var i = 0; i < data.hits.length && i < 15; i++) {
      var doc = data.hits[i].document || {};
      var pTitle = doc.post_title || "";
      var link = doc.permalink || "";
      if (!link) continue;
      if (link.charAt(0) === "/") link = base + link;
      var hay = (pTitle + " " + link).toLowerCase().replace(RE_NONALNUM, "");
      if (cleanQ && hay.indexOf(cleanQ) < 0 && cleanQ.indexOf(hay.slice(0, cleanQ.length)) < 0) continue;
      return { url: link, title: pTitle || title, content: null };
    }
  }
  return null;
}

function scrapeSearchHtml(html, title, year, isSeries, base, relaxed) {
  try {
    var body = html.split('id="main"')[1] || html;
    var cleanQ = title.toLowerCase().replace(RE_NONALNUM, "");
    var typeStr = isSeries ? "-series-" : "-movie-";
    var antiStr = isSeries ? "-movie-" : "-series-";
    var linkRe = /href="(https?:\/\/[^"\/]+)?(\/[^"]+)"/g;
    var best = null, m;
    while ((m = linkRe.exec(body)) !== null) {
      var domain = m[1] || "";
      var path = m[2];
      /* internal links only (host check tolerant of both site families) */
      if (domain && domain.indexOf("4khdhub") < 0 && domain.indexOf("hdhub4u") < 0 && domain.indexOf(base.replace(/^https?:\/\//, "")) < 0) continue;
      if (path.indexOf("/category/") >= 0 || path.indexOf("?") >= 0) continue;
      if (!relaxed) {
        if (path.indexOf(typeStr) < 0) continue;
        if (path.indexOf(antiStr) >= 0) continue;
      }
      var slugWords = path.split("/").filter(Boolean).pop().split("-");
      var slugClean = slugWords.filter(function (w) { return !RE_SLUG_JUNK.test(w); }).join("").toLowerCase().replace(RE_NONALNUM, "");
      if (!slugClean || (slugClean.indexOf(cleanQ) < 0 && cleanQ.indexOf(slugClean) < 0)) continue;

      var ctx = body.substring(m.index, m.index + 300);
      var yearMatch = RE_YEAR.exec(ctx);
      var yearHit = year && yearMatch && yearMatch[1] === year;

      if (!best || yearHit) {
        best = { url: base + path, title: title, content: null };
        if (yearHit) break;
      }
    }
    return best;
  } catch (_) { return null; }
}

/* ---------- hubcloud link extraction (hexion logic) ---------- */
function extractHubcloudLinks(html, season, episode, isSeries) {
  var results = [];
  var scope = html;

  if (isSeries) {
    var start = html.indexOf('id="episodes"');
    if (start < 0) start = html.indexOf('data-tab="episodes"');
    if (start >= 0) {
      scope = html.substring(start);
      var end = scope.indexOf('id="complete-pack"');
      if (end >= 0) scope = scope.substring(0, end);
    }
  }

  RE_HUBCLOUD.lastIndex = 0;
  var m;
  while ((m = RE_HUBCLOUD.exec(scope)) !== null) {
    var url = m[0];

    if (isSeries) {
      var ctxBefore = scope.substring(Math.max(0, m.index - 3000), m.index);
      var ctxAfter = scope.substring(m.index, Math.min(scope.length, m.index + 500));
      var ctx = ctxBefore + ctxAfter;

      var epMatch = RE_SXEX.exec(ctx) || RE_EP.exec(ctx);
      if (!epMatch) continue;

      var s = season, e;
      if (epMatch[2]) { s = +epMatch[1]; e = +epMatch[2]; }
      else { e = +epMatch[1]; }
      if (s !== season || e !== episode) continue;

      var qm = RE_QUALITY.exec(ctxBefore);
      var quality = "HD";
      if (qm) {
        var v = qm[1] || qm[2];
        quality = (v.toUpperCase() === "4K" || v.toUpperCase() === "UHD") ? "2160P" : v.toUpperCase() + "P";
      }
      if (quality === "480P") continue;

      var sm = RE_SIZE_CTX.exec(ctxBefore);
      results.push({ url: url, quality: quality, size: sm ? sm[1] + " " + sm[2] : "" });
    } else {
      var context = scope.substring(Math.max(0, m.index - 1500), m.index);

      var qm2 = RE_QUALITY.exec(context);
      var quality2 = "HD";
      if (qm2) {
        var v2 = qm2[1] || qm2[2];
        quality2 = (v2.toUpperCase() === "4K" || v2.toUpperCase() === "UHD") ? "2160P" : v2.toUpperCase() + "P";
      }
      if (quality2 === "480P") continue;

      var sm2 = RE_SIZE_CTX.exec(context);
      results.push({ url: url, quality: quality2, size: sm2 ? sm2[1] + " " + sm2[2] : "" });
    }
  }
  return results;
}

/* ---------- hdhub4u.cl family hops ----------
 * The current (4.39 device-verified) hdhub4u.cl posts do not embed hubcloud
 * drive links directly like 4khdhub.one: they link to hubdrive.sbs file
 * pages (one hop -> embedded hubcloud drive link) and sometimes straight to
 * hubcdn.lol redirectors (?r=<base64 of ?link=<direct>>). Quality/size come
 * from the surrounding post context; hubcdn defaults to 1080P like 4.39. */
function extractHubdriveLinks(html, isSeries) {
  var results = [];
  var scope = html;
  if (isSeries) {
    var start = html.indexOf('id="episodes"');
    if (start < 0) start = html.indexOf('data-tab="episodes"');
    if (start >= 0) {
      scope = html.substring(start);
      var end = scope.indexOf('id="complete-pack"');
      if (end >= 0) scope = scope.substring(0, end);
    }
  }
  var seen = {};
  RE_HUBDRIVE.lastIndex = 0;
  var m;
  while ((m = RE_HUBDRIVE.exec(scope)) !== null) {
    var url = m[0];
    if (seen[url]) continue;
    seen[url] = 1;
    var context = scope.substring(Math.max(0, m.index - 1500), m.index);
    var qm = RE_QUALITY.exec(context);
    var quality = "HD";
    if (qm) {
      var v = qm[1] || qm[2];
      quality = (v.toUpperCase() === "4K" || v.toUpperCase() === "UHD") ? "2160P" : v.toUpperCase() + "P";
    }
    if (quality === "480P") continue;
    var sm = RE_SIZE_CTX.exec(context);
    results.push({ url: url, quality: quality, size: sm ? sm[1] + " " + sm[2] : "" });
  }
  return results;
}

function extractHubCdnLinks(html) {
  var results = [];
  var seen = {};
  RE_HUBCDN.lastIndex = 0;
  var m;
  while ((m = RE_HUBCDN.exec(html)) !== null) {
    var url = m[0];
    if (seen[url]) continue;
    seen[url] = 1;
    var context = html.substring(Math.max(0, m.index - 1500), m.index);
    var qm = RE_QUALITY.exec(context);
    var quality = "1080P"; /* 4.39 hubcdn rows carried a fixed 1080 */
    if (qm) {
      var v = qm[1] || qm[2];
      quality = (v.toUpperCase() === "4K" || v.toUpperCase() === "UHD") ? "2160P" : v.toUpperCase() + "P";
    }
    if (quality === "480P") continue;
    var sm = RE_SIZE_CTX.exec(context);
    results.push({ url: url, quality: quality, size: sm ? sm[1] + " " + sm[2] : "" });
  }
  return results;
}

/* hubdrive.sbs file page -> embedded hubcloud drive link(s) (telegram skipped) */
async function resolveHubDrive(link, referer) {
  var out = [];
  try {
    var html = await fetchText(link.url, { headers: getHeaders({ Referer: referer || (activeDomain || "https://4khdhub.one") + "/" }) });
    if (!html) return out;
    RE_HUBCLOUD.lastIndex = 0;
    var m, seen = {};
    while ((m = RE_HUBCLOUD.exec(html)) !== null) {
      if (seen[m[0]]) continue;
      seen[m[0]] = 1;
      out.push({ url: m[0], quality: link.quality, size: link.size });
    }
  } catch (_) { }
  return out;
}

/* hubcdn.lol redirector: the page carries reurl="...?r=<base64>" (or an
 * inline ?link=<url-encoded direct>) -> decode and take the link= value */
async function resolveHubCdn(link, fallbackTitle, referer, runtime) {
  var streams = [];
  try {
    var html = await fetchText(link.url, { headers: getHeaders({ Referer: referer || (activeDomain || "https://4khdhub.one") + "/" }) });
    if (!html) return streams;
    var direct = null;
    var inline = html.match(/[?&]link=(https?%3A[^"'<>\s]+)/i);
    if (inline && inline[1]) {
      var dec = decodeURIComponent(inline[1]);
      if (/^https?:\/\//i.test(dec)) direct = dec;
    }
    if (!direct) {
      var rm = html.match(/[?&]r=([A-Za-z0-9+\/=]+)/);
      if (rm && rm[1]) {
        try {
          var bin = atob(rm[1]);
          var tail = bin.substring(bin.lastIndexOf("link=") + 5);
          if (tail && tail.indexOf("http") === 0) direct = tail;
        } catch (_) { }
      }
    }
    if (direct) {
      streams.push(makeStream(fallbackTitle, "HubCdn", direct, link.quality, "HubCdn", referer || (activeDomain || "https://4khdhub.one") + "/", link.size, runtime));
    }
  } catch (_) { }
  return streams;
}

/* ---------- row naming (Eclipsia "4kHdHub • Q • size" + info dropdown) ---------- */
function makeStream(filename, sourceName, streamUrl, quality, hostLabel, referer, size, runtime) {
  var qualityUp = (quality || "1080P").toUpperCase();
  var encodedUrl = streamUrl.replace(/ /g, "%20");
  var combined = (String(filename || "") + " " + String(sourceName || "") + " " + encodedUrl).toLowerCase();

  var langParts = [];
  if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
  if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
  if (/\btamil\b/.test(combined)) langParts.push("Tamil");
  if (/\btelugu\b/.test(combined)) langParts.push("Telugu");

  var source = "WEB-DL";
  var isRemux = false;
  if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
  else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
  else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";

  var hdrTag = "";
  if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
  else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
  else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
  else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

  var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";
  var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
  var codec = (/\b(?:hevc|x265|265)\b/.test(combined) || qualityUp === "2160P") ? "H.265" : "H.264";
  var isImax = /\bimax\b/.test(combined);

  var audio = "DDP 5.1";
  for (var i = 0; i < AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
  }
  if (/\batmos\b/.test(combined)) audio += " Atmos";

  var sizeMB = parseSizeMB(size);
  var mbps = calcMbps(sizeMB, runtime);

  var mainTitle = [PROVIDER_NAME, qualityUp, size].filter(Boolean).join(" \u2022 ");
  var line1 = langParts.join(" \u2022 ");
  var line2 = [source, isRemux && "REMUX", isImax && "IMAX", hostLabel || "FSL", mbps].filter(Boolean).join(" \u2022 ");
  var line3 = [bit10Tag, dvTag, hdrTag, codec, audio].filter(Boolean).join(" \u2022 ");
  var streamTitle = [line1, line2, line3].filter(Boolean).join("\n");

  return {
    name: mainTitle,
    title: streamTitle,
    url: encodedUrl,
    quality: qualityUp,
    headers: { Referer: referer || (activeDomain ? activeDomain + "/" : "https://4khdhub.one/") },
    _host: hostLabel || "FSL",
    _sizeRaw: size || "",
  };
}

async function resolveHubCloud(link, fallbackTitle, runtime) {
  var url = link.url, quality = link.quality, size = link.size;
  var streams = [];
  try {
    var html = await fetchText(url, { headers: getHeaders({ Referer: (activeDomain || "https://4khdhub.one") + "/" }) });
    if (!html) return streams;

    var phpMatch = html.match(/href="([^"]*hubcloud\.php[^"]*)"/i);
    if (!phpMatch) return streams;
    var phpUrl = phpMatch[1].replace(/&amp;/g, "&");

    var html2 = await fetchText(phpUrl, { headers: getHeaders({ Referer: url }) });
    if (!html2) return streams;

    var hm = RE_HEADER.exec(html2);
    var filename = hm ? hm[1].trim().replace(RE_EXT, "") : fallbackTitle;
    var fileSize = size || "";
    var sm = RE_SIZE_TD.exec(html2) || RE_SIZE_STR.exec(html2);
    if (sm) fileSize = sm[1].trim();

    var linkRegex = /<a[^>]+href="([^"]+)"[^>]*>(?:<i[^>]*><\/i>)?\s*([^<]+)<\/a>/gi;
    var m;
    while ((m = linkRegex.exec(html2)) !== null) {
      var streamUrl = m[1].replace(/&amp;/g, "&");
      var label = m[2].trim();
      if (!streamUrl || streamUrl.indexOf("javascript:") === 0) continue;
      if (RE_ZIP_RAR.test(streamUrl)) continue;
      if (RE_PIXEL.test(streamUrl)) continue;
      if (/telegram/i.test(label) || /tg\//i.test(streamUrl)) continue;
      if (/hubcloud\.cx\/drive\/admin/i.test(streamUrl)) continue;
      if (/bzzhr/i.test(streamUrl)) continue;
      if (/pixeldrain\.[a-z0-9.-]+\/u\//i.test(streamUrl)) continue;

      var host = "";
      if (/cdn\.fsl-buckets\.life|r2\.cloudflarestorage|r2\.dev/i.test(streamUrl)) {
        host = "FSL-v2";
      } else if (/hub\.(latent|whistle)/i.test(streamUrl)) {
        host = "FSL";
        streamUrl = streamUrl + "1" + new Date().getMinutes();
      } else if (/workers\.dev/i.test(streamUrl)) {
        host = "Worker";
      } else {
        continue;
      }

      streams.push(makeStream(filename, host, streamUrl, quality, host, phpUrl, fileSize, runtime));
    }

    var pxlMatch = RE_PXL_VAR.exec(html2) || RE_PXL_HREF.exec(html2);
    if (pxlMatch && pxlMatch[1]) {
      var pdUrl = "https://pixeldrain.com/api/file/" + pxlMatch[1];
      var dup = false;
      for (var i = 0; i < streams.length; i++) if (streams[i].url === pdUrl) { dup = true; break; }
      if (!dup) {
        streams.push(makeStream(filename, "PixelDrain", pdUrl, quality, "PixelDrain", phpUrl, fileSize, runtime));
      }
    }
  } catch (_) { }
  return streams;
}

/* ---------- final ordering: best resolution / biggest size first ---------- */
function resWeight(quality) {
  var q = (quality || "").toUpperCase();
  if (q === "2160P" || q === "4K") return 4;
  if (q === "1080P") return 3;
  if (q === "720P") return 2;
  return 1;
}

function sortAndDedupe(streams) {
  var seen = {};
  var out = [];
  streams.sort(function (a, b) {
    var rd = resWeight(b.quality) - resWeight(a.quality);
    if (rd !== 0) return rd;
    return (parseSizeMB(b._sizeRaw) || 0) - (parseSizeMB(a._sizeRaw) || 0);
  });
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || !s.url || seen[s.url]) continue;
    seen[s.url] = 1;
    out.push(s);
  }
  return out;
}

/* ---------- entry point ---------- */
async function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return [];
  if (mediaType !== "movie" && mediaType !== "tv") return [];
  if (mediaType === "tv" && (season == null || episode == null)) return [];

  var isSeries = mediaType === "tv";
  var streams = [];

  try {
    var info = await getTMDBInfo(tmdbId, mediaType);
    if (!info.title) return streams;

    var base = await getActiveDomain();
    var result = await searchSite(info.title, info.year, info.imdbId, isSeries, base);
    if (!result) return streams;

    var html = (!isSeries && result.content) || (await fetchText(result.url));
    if (!html) return streams;

    /* three link families, prioritized: direct hubcloud (4khdhub.one posts),
     * hubdrive hops (hdhub4u.cl posts), hubcdn redirectors */
    var links = extractHubcloudLinks(html, parseInt(season, 10) || 0, parseInt(episode, 10) || 0, isSeries);
    var hubdriveLinks = extractHubdriveLinks(html, isSeries);
    var hubCdnLinks = isSeries ? [] : extractHubCdnLinks(html);
    var budget = MAX_LINKS;
    if (links.length > budget) links = links.slice(0, budget);
    budget -= links.length;
    if (hubdriveLinks.length > budget) hubdriveLinks = hubdriveLinks.slice(0, Math.max(0, budget));
    budget -= hubdriveLinks.length;
    if (hubCdnLinks.length > budget) hubCdnLinks = hubCdnLinks.slice(0, Math.max(0, budget));

    /* sequential resolves with early exit (device bridge runs blocking calls
     * one at a time; a parallel fan-out would only add latency) */
    for (var i = 0; i < links.length && streams.length < MAX_STREAMS; i++) {
      var rows = await resolveHubCloud(links[i], info.title, info.runtime);
      for (var j = 0; j < rows.length && streams.length < MAX_STREAMS; j++) streams.push(rows[j]);
    }
    for (var k = 0; k < hubdriveLinks.length && streams.length < MAX_STREAMS; k++) {
      var driveLinks = await resolveHubDrive(hubdriveLinks[k], result.url);
      for (var d = 0; d < driveLinks.length && streams.length < MAX_STREAMS; d++) {
        var dRows = await resolveHubCloud(driveLinks[d], info.title, info.runtime);
        for (var e = 0; e < dRows.length && streams.length < MAX_STREAMS; e++) streams.push(dRows[e]);
      }
    }
    for (var c = 0; c < hubCdnLinks.length && streams.length < MAX_STREAMS; c++) {
      var cRows = await resolveHubCdn(hubCdnLinks[c], info.title, result.url, info.runtime);
      for (var f = 0; f < cRows.length && streams.length < MAX_STREAMS; f++) streams.push(cRows[f]);
    }

    streams = sortAndDedupe(streams);
  } catch (_) { }

  return streams;
}

module.exports = { getStreams };


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
  var PROVIDER = "hdhub4u";
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


/* ===== nv-plugins device waterfall merge v2.0.0 (pack 4.37.0, 2026-09-14) ======
   Device truth (NuvioMobile PluginRuntime.kt + quickjs-kt 1.0.5-nuvio AAR):
   no timers in the realm (every Promise.race cap was inert or threw
   ReferenceError), each fetch is one BLOCKING host call (lanes run
   sequentially regardless of Promise.all), app kills the call at 60s. The
   old 4.33.0 merge ran BOTH lanes on every call and its cap() called
   setTimeout DIRECTLY -> the whole provider rejected -> 0 rows.
   v2.0.0: sequential waterfall bounded by fetch count, fail-soft both lanes.
     __WINGS_FIRST = true  : WINGS lane first, native only when empty
   ========================================================================== */
(function () {
  'use strict';
  var __LABEL = '4KHDHUB';
  var __WINGS_FIRST = true;
  var __ALT_NAME = '__nvWingsStreams';
  function __junk(u) { return /tungtungtungsahur\.cfd|\/api\?d=/i.test(String(u || '')); }
  var __orig = null;
  try { __orig = module.exports && module.exports.getStreams; } catch (e) { __orig = null; }
  if (typeof __orig !== 'function') return;
  function runAlt(args, self) {
    var f = null;
    try { f = (typeof globalThis !== 'undefined' && globalThis) ? globalThis[__ALT_NAME] : null; } catch (e) { f = null; }
    if (typeof f !== 'function') return Promise.resolve([]);
    try {
      var r = f({ tmdbId: args[0], mediaType: args[1], season: args[2], episode: args[3], label: __LABEL });
      return Promise.resolve(r).then(function (v) { return Array.isArray(v) ? v : []; }, function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }
  function runNative(args, self) {
    try {
      var r = __orig.apply(self, args);
      return Promise.resolve(r).then(function (v) { return Array.isArray(v) ? v : []; }, function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }
  module.exports.getStreams = function () {
    var args = Array.prototype.slice.call(arguments), self = this;
    function clean(v) {
      var seen = {}, out = [];
      (v || []).forEach(function (r) {
        if (!r || !r.url || __junk(r.url)) return;
        var k = String(r.url);
        if (seen[k]) return;
        seen[k] = 1; out.push(r);
      });
      return out;
    }
    function laneA() { return __WINGS_FIRST ? runAlt(args, self) : runNative(args, self); }
    function laneB() { return __WINGS_FIRST ? runNative(args, self) : runAlt(args, self); }
    return Promise.resolve().then(laneA).then(function (rows) {
      rows = clean(rows);
      if (rows.length) return rows;
      return Promise.resolve().then(laneB).then(function (rows2) { return clean(rows2); });
    });
  };
})();
