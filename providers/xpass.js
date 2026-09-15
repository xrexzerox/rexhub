/*
 * nv-plugins xpass.js — FULLY DECODED port of the All-in-One-Nuvio provider (4.24.0 merge pass).
 * Decoded from the obfuscated AIO build: string tables resolved, decoder machinery stripped,
 * every network call capped by an 8s deadline, node-core requires fail-soft, nvio post-filter
 * attached (en/tl audio gate, >=720p quality gate, cross-provider dedupe). Endpoints/keys/headers
 * identical to the AIO original.
 */
/* nv-plugins best-settings pass 4.24.0: hard 8s deadline on every network call */
var __nvFetch = (function () {
  var _f = null;
  try { _f = (typeof fetch === "function") ? fetch : null; } catch (e) { _f = null; }
  if (!_f) return function () { return Promise.reject(new Error("no fetch")); };
  var hasT = typeof setTimeout === "function";
  return function (input, init) {
    var p;
    try { p = _f.apply(this, arguments); } catch (e) { return Promise.reject(e); }
    if (!hasT || !p || typeof p.then !== "function") return p;
    return Promise.race([p, new Promise(function (_res, rej) {
      var t = setTimeout(function () { rej(new Error("nv deadline 8s")); }, 8000);
      if (t && typeof t.unref === "function") t.unref();
    })]);
  };
})();
/* fail-soft require: node-core modules (net/http/assert/...) never crash the provider */
var __nvRequire = (function () {
  var _rq = null;
  try { _rq = (typeof require === "function") ? require : null; } catch (e) { _rq = null; }
  return function (name) {
    if (_rq) { try { return _rq(name); } catch (e) { } }
    return {};
  };
})();
/* QuickJS-safe global aliases: embedded polyfills (forge/uuid/whatwg) reference
   window/self/document unguarded - in Nuvio's QuickJS those would throw
   ReferenceError at module load and kill the provider. */
var window = (typeof window !== "undefined" && window) ? window
  : (typeof globalThis !== "undefined" ? globalThis : (typeof global !== "undefined" ? global : {}));
var self = (typeof self !== "undefined" && self) ? self : window;
var document = (typeof document !== "undefined" && document) ? document : { createElement: function () { return { style: {}, setAttribute: function () { }, getElementsByTagName: function () { return []; } }; }, getElementsByTagName: function () { return []; }, addEventListener: function () { } };
var navigator = (typeof navigator !== "undefined" && navigator) ? navigator : { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36" };

/* ============================================================
 * xpass v2.0.0 (nv-plugins 4.32.0) — site's own v3 data lane.
 * Old lane (inline `var backups=[...]` JSON) is gone upstream: the page now
 * ships an empty backups=[] plus a SIGNED data URL:
 *   var dataUrl="/data/movie/693134?autostart=false&token=<b64url>.<64hex>"
 * The /data response is an AES-GCM ciphertext (base64url):
 *   key = SHA256("spv3-data-response|spv3-build-1787821613-50e5fc97c9dce367|"
 *                + pathname + "|" + token)
 *   iv  = first 12 bytes of the decoded blob
 * Decrypts to JSON [{url,label|name,...}] (backup playlist endpoints); each
 * endpoint returns {playlist:[{sources:[{file,label,...}]}]}. All of this was
 * recovered from the site's own player script and verified live (playlist 200,
 * M3U8 served; same token valid on sibling CDN host ncdn.imgnex.top).
 * Device crypto: AES-GCM + SHA-256 through crypto.subtle (the Nuvio crypto
 * polyfill implements subtle.importKey/decrypt for AES-GCM 128-bit tags) with
 * a CryptoJS SHA-256 fallback. QuickJS-safe: no Buffer, no atob, no TextEncoder.
 * ============================================================ */
var XPASS_API = 'https://play.xpass.top';
var XPASS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var XPASS_HEADERS = { 'User-Agent': XPASS_UA, 'Referer': XPASS_API + '/' };
var XPASS_BUILD = 'spv3-build-1787821613-50e5fc97c9dce367';

function xpassSubtle() {
  try {
    if (typeof crypto !== 'undefined' && crypto && crypto.subtle &&
        typeof crypto.subtle.digest === 'function' &&
        typeof crypto.subtle.importKey === 'function' &&
        typeof crypto.subtle.decrypt === 'function') return crypto.subtle;
  } catch (e) {}
  return null;
}
function xpassCrypto() {
  try {
    if (typeof CryptoJS !== 'undefined' && CryptoJS && CryptoJS.SHA256) return CryptoJS;
    if (typeof require === 'function') { var C = require('crypto-js'); if (C && C.SHA256) return C; }
  } catch (e) {}
  return null;
}
function xpassHexToBytes(hex) {
  var out = new Uint8Array(hex.length >> 1);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function xpassBytesToB64url(bytes) {
  var tbl = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b1 = bytes[i], b2 = i + 1 < bytes.length ? bytes[i + 1] : -1, b3 = i + 2 < bytes.length ? bytes[i + 2] : -1;
    out += tbl[b1 >> 2];
    out += b2 >= 0 ? tbl[((b1 & 3) << 4) | (b2 >> 4)] : tbl[(b1 & 3) << 4];
    out += b3 >= 0 ? tbl[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    out += b3 >= 0 ? tbl[b3 & 63] : '=';
  }
  return out;
}
function xpassB64ToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  var tbl = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = [];
  for (var i = 0; i < s.length; i += 4) {
    var c0 = tbl.indexOf(s.charAt(i)), c1 = tbl.indexOf(s.charAt(i + 1));
    var c2 = i + 2 < s.length ? tbl.indexOf(s.charAt(i + 2)) : -1;
    var c3 = i + 3 < s.length ? tbl.indexOf(s.charAt(i + 3)) : -1;
    if (c0 < 0 || c1 < 0) continue;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) out.push(((c2 & 3) << 6) | c3);
  }
  return new Uint8Array(out);
}
function xpassSha256Hex(str) {
  var sub = xpassSubtle();
  if (sub) {
    var bytes = new Uint8Array(String(str).length);
    for (var i = 0; i < bytes.length; i++) bytes[i] = String(str).charCodeAt(i) & 0xff;
    return sub.digest('SHA-256', bytes).then(function (buf) {
      return xpassBytesToHex(new Uint8Array(buf));
    });
  }
  var C = xpassCrypto();
  if (C) return Promise.resolve(C.SHA256(String(str)).toString(C.enc.Hex));
  return Promise.reject(new Error('no sha256 available'));
}
function xpassBytesToHex(u8) {
  var h = '';
  for (var i = 0; i < u8.length; i++) h += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
  return h;
}
// AES-GCM decrypt via crypto.subtle (device polyfill + browsers + node all ship it)
function xpassAesGcmDecrypt(keyHex, ivBytes, ctBytes) {
  var sub = xpassSubtle();
  if (!sub) return Promise.reject(new Error('crypto.subtle unavailable (needed for AES-GCM)'));
  return sub.importKey('raw', xpassHexToBytes(keyHex), { name: 'AES-GCM' }, false, ['decrypt'])
    .then(function (key) {
      return sub.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes);
    })
    .then(function (pt) {
      var u8 = new Uint8Array(pt), s = '';
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return s;
    });
}
function xpassTimeout(p, ms) {
  if (typeof setTimeout !== 'function') return p;
  return Promise.race([p, new Promise(function (res) {
    var t = setTimeout(function () { res(null); }, ms);
    if (t && typeof t.unref === 'function') t.unref();
  })]);
}
// master playlist -> variant rows (kept from the 4.24.0 port; used per source file)
function xpassParseMaster(masterUrl, text) {
  try {
    var base = masterUrl.substring(0, masterUrl.lastIndexOf('/')) + '/';
    var rows = [], re = /#EXT-X-STREAM-INF:.*?RESOLUTION=(\d+x\d+).*?\n([^\n]+)/g, m;
    while ((m = re.exec(text)) !== null) {
      var q = m[1].split('x')[1] + 'p';
      var u = m[2].trim();
      if (!u) continue;
      if (!/^http/i.test(u)) {
        if (u.charAt(0) === '/') {
          var org = '';
          try { org = new URL(masterUrl).origin; } catch (e) {}
          u = org + u;
        } else u = base + u;
      }
      rows.push({ quality: q, url: u });
    }
    if (rows.length === 0) return [{ quality: 'Auto', url: masterUrl }];
    rows.sort(function (a, b) { return parseInt(b.quality) - parseInt(a.quality); });
    return rows.slice(0, 3);
  } catch (e) {
    return [{ quality: 'Auto', url: masterUrl }];
  }
}
function xpassIsM3u8(u) { return /\.m3u8(\?|$)/i.test(String(u)) || /master\.txt(\?|$)/i.test(String(u)); }

// one backup endpoint -> {playlist:[{sources:[{file,label}]}]} rows
function xpassFetchBackup(url) {
  var full = /^http/i.test(url) ? url : XPASS_API + url;
  return xpassTimeout(__nvFetch(full, { headers: XPASS_HEADERS }), 4500)
    .then(function (r) {
      if (!r || !r.ok) return [];
      return r.json();
    })
    .then(function (j) {
      if (!j) return [];
      var pl = j.playlist || j;
      var items = Array.isArray(pl) ? pl : [];
      var out = [];
      items.slice(0, 2).forEach(function (item) {
        var srcs = (item && item.sources) || [];
        srcs.slice(0, 3).forEach(function (src) {
          var f = src && src.file;
          if (!f || !/^http/i.test(String(f))) return;
          out.push({ file: String(f), label: (src && src.label) || (item && item.title) || 'Server' });
        });
      });
      return out;
    })
    .catch(function () { return []; });
}

async function xpassDataLane(dataUrl, pageUrl) {
  var qm = String(dataUrl).match(/token=([^&"]+)/);
  if (!qm) throw new Error('no token in dataUrl');
  var token = qm[1];
  var pathname = String(dataUrl).split('?')[0];
  var km = 'spv3-data-response|' + XPASS_BUILD + '|' + pathname + '|' + token;
  var keyHex = await xpassSha256Hex(km);
  var blobRes = await xpassTimeout(__nvFetch(XPASS_API + dataUrl, { headers: { 'User-Agent': XPASS_UA, 'Referer': pageUrl + '/' } }), 5500);
  if (!blobRes || !blobRes.ok) throw new Error('data lane HTTP ' + (blobRes ? blobRes.status : 'null'));
  var blobText = (await blobRes.text()).trim();
  if (!blobText) throw new Error('empty data blob');
  var raw = xpassB64ToBytes(blobText);
  if (raw.length <= 12) throw new Error('blob too short');
  var iv = raw.slice(0, 12);
  var ct = raw.slice(12);
  var plain = await xpassAesGcmDecrypt(keyHex, iv, ct);
  var arr = JSON.parse(plain);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('no backups');
  return arr;
}

async function getStreams(tmdbId, type = 'movie', season = null, episode = null) {
  console.log('[Xpass] v2.0.0 fetching ' + type + ' ' + tmdbId);
  const isTV = type === 'tv' || type === 'series';
  const embed = isTV
    ? XPASS_API + '/e/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : XPASS_API + '/e/movie/' + tmdbId;
  const rows = [];
  try {
    const pageRes = await xpassTimeout(__nvFetch(embed, { headers: { 'User-Agent': XPASS_UA, 'Referer': 'https://xpass.top/' } }), 6000);
    if (!pageRes || !pageRes.ok) {
      console.log('[Xpass] embed page HTTP ' + (pageRes ? pageRes.status : 'null'));
      return [];
    }
    const page = await pageRes.text();
    const dm = page.match(/var\s+dataUrl\s*=\s*"([^"]+)"/);
    let backups = null;
    if (dm) {
      const dataUrl = dm[1].replace(/&amp;/g, '&');
      try {
        backups = await xpassDataLane(dataUrl, XPASS_API);
        console.log('[Xpass] data lane OK, backups: ' + backups.length);
      } catch (e) {
        console.log('[Xpass] data lane failed: ' + e.message);
      }
    } else {
      console.log('[Xpass] no dataUrl in page');
    }
    // legacy lane: inline backups JSON (kept for older page shapes)
    if (!backups || backups.length === 0) {
      const bm = page.match(new RegExp('var backups\\s*=\\s*(\\[.*?\\])\\s*(?:;|<\\/script>)', 's'));
      if (bm) {
        try { backups = JSON.parse(bm[1]); } catch (e) { backups = null; }
      }
    }
    if (!backups || backups.length === 0) return [];
    // resolve up to 4 backups in parallel, each fail-soft
    const picked = backups.slice(0, 4);
    const lists = await Promise.all(picked.map(b => xpassFetchBackup(b && b.url)));
    const seen = {};
    let serverIdx = 0;
    for (const list of lists) {
      serverIdx++;
      for (const src of (list || [])) {
        if (!src || !src.file) continue;
        const label = String(src.label || 'S' + serverIdx).replace(/[\r\n]+/g, ' ');
        const key = src.file.slice(0, 110);
        if (seen[key]) continue;
        seen[key] = 1;
        if (xpassIsM3u8(src.file)) {
          // read variants so rows carry a real quality label (post-filter keeps them)
          let variants = null;
          try {
            const mres = await xpassTimeout(__nvFetch(src.file, { headers: XPASS_HEADERS }), 3500);
            if (mres && mres.ok) {
              const mtext = await mres.text();
              if (mtext && mtext.indexOf('#EXTM3U') !== -1) {
                variants = xpassParseMaster(src.file, mtext);
              }
            }
          } catch (e) {}
          if (variants && variants.length) {
            variants.forEach(v => {
              rows.push({
                name: 'Xpass | ' + label + ' | ' + v.quality,
                title: '🎬 Xpass | ' + label + '\n📺 ' + v.quality,
                url: v.url,
                quality: v.quality,
                type: 'm3u8',
                headers: { 'Referer': XPASS_API + '/', 'User-Agent': XPASS_UA }
              });
            });
          } else {
            rows.push({
              name: 'Xpass | ' + label + ' | Auto',
              title: '🎬 Xpass | ' + label + '\n📺 Auto',
              url: src.file,
              quality: 'Auto',
              type: 'm3u8',
              headers: { 'Referer': XPASS_API + '/', 'User-Agent': XPASS_UA }
            });
          }
        } else {
          rows.push({
            name: 'Xpass | ' + label + ' | Auto',
            title: '🎬 Xpass | ' + label + '\n📺 Direct',
            url: src.file,
            quality: 'Auto',
            headers: { 'Referer': XPASS_API + '/', 'User-Agent': XPASS_UA }
          });
        }
        if (rows.length >= 12) break;
      }
      if (rows.length >= 12) break;
    }
  } catch (e) {
    console.log('[Xpass] error: ' + e.message);
  }
  console.log('[Xpass] returning ' + rows.length + ' rows');
  return rows;
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
  var PROVIDER = "xpass";
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
