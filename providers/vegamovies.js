"use strict";
// vegamovies.js - eclipsia solunix.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: atob, lite, sleep, timer.
// Subtitles: passed through as upstream emits them (English/Tagalog tracks kept when upstream provides).

/* device guard: Nuvio realm may lack global atob (pack house fix, same as netmirror v17) */
if (typeof globalThis.atob !== "function") {
  globalThis.atob = function (input) {
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/[\t\n\f\r ]/g, "").replace(/=+$/, "");
    var out = "";
    var bits = 0;
    var acc = 0;
    for (var i = 0; i < str.length; i++) {
      var c = B64.indexOf(str.charAt(i));
      if (c < 0 || c === 64) continue;
      acc = (acc << 6) | c;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((acc >> bits) & 0xff);
      }
    }
    return out;
  };
}

/* ===== nv cheerio-lite v2 (pack 4.43.0) =====================================
   Device-safe replacement for require("cheerio") - the Nuvio ES2020 realm
   ships no require() and no node modules. Covers the selector surface the
   Eclipsia sources actually use: tag / #id / .class / tag.class / [attr],
   [attr="v"], [attr*="v"], [attr^="v"], [attr$="v"], descendant chains,
   child combinator (h5 > a) and comma lists; methods: each/attr/text/html/
   find/filter/map/get/first/length plus $.html() for the whole document.
   Parity-tested in the sandbox against real cheerio on live fixtures.
========================================================================== */
var __nvCheerioLite = (function () {
  var VOID = { br:1, img:1, input:1, meta:1, link:1, hr:1, source:1, area:1, base:1, col:1, embed:1, track:1, wbr:1 };

  /* entity decoding (cheerio parity: text/attr values come back decoded) */
  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "\u00a9", reg: "\u00ae", hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d" };
  function decodeEntities(s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, g) {
      if (g.charAt(0) === "#") {
        var num = (g.charAt(1) === "x" || g.charAt(1) === "X") ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        if (!isFinite(num) || num < 0 || num > 0x10ffff) return m;
        if (num > 0xffff) { num -= 0x10000; return String.fromCharCode(0xd800 + (num >> 10), 0xdc00 + (num & 0x3ff)); }
        return String.fromCharCode(num);
      }
      return ENT[g] !== undefined ? ENT[g] : m;
    });
  }

  function parseHtml(html) {
    var src = String(html || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
    var root = { tag: "#root", attrs: {}, children: [], parent: null };
    var stack = [root];
    var re = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|([^<]+)/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      if (m[1]) {
        var tag = m[1].toLowerCase();
        var node = { tag: tag, attrs: {}, children: [], parent: stack[stack.length - 1] };
        var are = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, am;
        while ((am = are.exec(m[2] || "")) !== null) {
          node.attrs[am[1].toLowerCase()] = decodeEntities(am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : "")));
        }
        node.parent.children.push(node);
        if (!m[3] && !VOID[tag]) stack.push(node);
      } else if (m[4]) {
        var ct = m[4].toLowerCase();
        for (var k = stack.length - 1; k > 0; k--) {
          if (stack[k].tag === ct) { stack.length = k; break; }
        }
      } else if (m[5]) {
        if (/\S/.test(m[5])) {
          var tp = stack[stack.length - 1];
          tp.children.push({ tag: "#text", attrs: {}, children: [], parent: tp, text: decodeEntities(m[5]) });
        }
      }
    }
    return root;
  }

  /* ---------- serialization (for .html()) ---------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function serializeEl(el) {
    if (el.tag === "#text") return escapeHtml(el.text);
    var out = "<" + el.tag, k;
    for (k in el.attrs) out += " " + k + '="' + escapeHtml(el.attrs[k]).replace(/"/g, "&quot;") + '"';
    out += ">";
    if (VOID[el.tag]) return out;
    var i;
    for (i = 0; i < el.children.length; i++) out += serializeEl(el.children[i]);
    return out + "</" + el.tag + ">";
  }
  function innerHtml(el) {
    var out = "", i;
    for (i = 0; i < el.children.length; i++) out += serializeEl(el.children[i]);
    return out;
  }

  /* ---------- selectors ---------- */
  function parseCompound(tok) {
    var c = { tag: "*", id: null, classes: [], attrs: [] };
    var re = /([a-zA-Z][a-zA-Z0-9-]*|\*)|#([a-zA-Z0-9_-]+)|\.([a-zA-Z0-9_-]+)|\[([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:([*^$|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\]/g;
    var mm;
    while ((mm = re.exec(tok)) !== null) {
      if (mm[1]) c.tag = mm[1].toLowerCase();
      else if (mm[2]) c.id = mm[2];
      else if (mm[3]) c.classes.push(mm[3]);
      else if (mm[4]) c.attrs.push({
        name: mm[4].toLowerCase(),
        op: mm[5] || null,
        val: mm[6] !== undefined ? mm[6] : (mm[7] !== undefined ? mm[7] : (mm[8] !== undefined ? mm[8] : ""))
      });
    }
    return c;
  }
  function matchCompound(el, c) {
    if (c.tag !== "*" && el.tag !== c.tag) return false;
    if (c.id && el.attrs.id !== c.id) return false;
    if (c.classes.length) {
      var cls = (el.attrs.class || "").split(/\s+/), i;
      for (i = 0; i < c.classes.length; i++) if (cls.indexOf(c.classes[i]) === -1) return false;
    }
    var j, a, v;
    for (j = 0; j < c.attrs.length; j++) {
      a = c.attrs[j];
      v = el.attrs[a.name];
      if (v === undefined) return false;
      if (a.op === "=" && v !== a.val) return false;
      if (a.op === "*=" && v.indexOf(a.val) === -1) return false;
      if (a.op === "^=" && v.indexOf(a.val) !== 0) return false;
      if (a.op === "$=" && v.slice(-a.val.length) !== a.val) return false;
    }
    return true;
  }
  function matchesPart(el, part) {
    var raw = String(part || "").trim();
    if (!raw) return false;
    var pieces = raw.replace(/>/g, " > ").split(/\s+/);
    var toks = [], i, pendingChild = false;
    for (i = 0; i < pieces.length; i++) {
      if (pieces[i] === ">") { pendingChild = true; continue; }
      toks.push({ c: parseCompound(pieces[i]), childNext: pendingChild });
      pendingChild = false;
    }
    var idx = toks.length - 1;
    if (!matchCompound(el, toks[idx].c)) return false;
    var node = el.parent;
    idx--;
    while (idx >= 0) {
      if (!node || node.tag === "#root") return false;
      if (matchCompound(node, toks[idx].c)) {
        idx--;
        node = node.parent;
      } else {
        if (toks[idx + 1].childNext) return false;
        node = node.parent;
      }
    }
    return true;
  }
  function selectAll(scope, sel) {
    var parts = String(sel || "").split(","), out = [];
    (function walk(node) {
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        if (c.tag === "#text") continue;
        for (var p = 0; p < parts.length; p++) {
          if (matchesPart(c, parts[p])) { out.push(c); break; }
        }
        walk(c);
      }
    })(scope);
    return out;
  }
  function collectText(el) {
    var out = "", i;
    for (i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      out += (c.tag === "#text") ? c.text : collectText(c);
    }
    return out;
  }

  /* ---------- collection / $ ---------- */
  function wrapEl(el) {
    return {
      attr: function (n) {
        var v = el.attrs[String(n || "").toLowerCase()];
        return v === undefined ? undefined : String(v);
      },
      text: function () { return collectText(el); },
      html: function () { return innerHtml(el); },
      find: function (sel) { return makeColl(selectAll(el, sel)); }
    };
  }
  function makeColl(els) {
    var coll = {
      length: els.length,
      each: function (fn) { for (var i = 0; i < els.length; i++) fn(i, els[i]); return coll; },
      attr: function (n) { return els.length ? wrapEl(els[0]).attr(n) : undefined; },
      text: function () { var o = "", i; for (i = 0; i < els.length; i++) o += collectText(els[i]); return o; },
      html: function () { return els.length ? innerHtml(els[0]) : ""; },
      find: function (sel) {
        var all = [], i;
        for (i = 0; i < els.length; i++) all = all.concat(selectAll(els[i], sel));
        return makeColl(all);
      },
      filter: function (fn) {
        var out = [], i;
        for (i = 0; i < els.length; i++) if (fn(i, els[i])) out.push(els[i]);
        return makeColl(out);
      },
      map: function (fn) {
        var out = [], i, r;
        for (i = 0; i < els.length; i++) {
          r = fn(i, els[i]);
          if (r && typeof r.length === "number" && typeof r !== "string") out = out.concat(r); /* cheerio flattens array results */
          else out.push(r);
        }
        return makeColl(out);
      },
      get: function () { return els; },
      first: function () { return makeColl(els.length ? [els[0]] : []); }
    };
    return coll;
  }

  return {
    load: function (html) {
      var root = parseHtml(html);
      var $ = function (selOrEl, ctx) {
        if (selOrEl && selOrEl.tag) return makeColl([selOrEl]);
        var scope = root;
        if (ctx && ctx.tag) scope = ctx;
        else if (ctx && ctx.length && ctx[0] && ctx[0].tag) scope = ctx[0];
        return makeColl(selectAll(scope, selOrEl));
      };
      $.html = function () {
        var out = "", i;
        for (i = 0; i < root.children.length; i++) out += serializeEl(root.children[i]);
        return out;
      };
      $.text = function () { return collectText(root); };
      return $;
    }
  };
})();

var cheerio = __nvCheerioLite;

/* device-safe helpers (pack house) */
function nvQs(params) {
  return Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
  }).join("&");
}
function nvSleep(ms) {
  return new Promise(function (r) {
    if (typeof setTimeout === "function") setTimeout(r, ms); else r();
  });
}
function nvTimeoutRej(ms, err) {
  return new Promise(function (_, rej) {
    if (typeof setTimeout === "function") setTimeout(function () { rej(err); }, ms);
  });
}
function nvUtf8Decode(bytes) {
  var out = "", i = 0;
  while (i < bytes.length) {
    var b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0 && b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b >= 0xe0 && b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}
const PROVIDER = "VegaMovies";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://new1.vegamovies.futbol";
const HUB_DOMAIN = "https://hubcloud.cx";
const VC_DOMAIN = "https://vcloud.fit";
const MAX_1080P = 4;
const ALLOWED_Q = ['2160p', '4k', '1440p', '1080p'];
const Q_WEIGHTS = { '2160p': 4, '4k': 4, '1440p': 3, '1080p': 2, '720p': 1, 'HD': 0 };
const EXCLUDED = ['filepress', 'gdtot', 'dropgalaxy', 'gdflix', 'gdlink'];
const MOBILE_UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
];

let count1080p = 0;

const mobileHdrs = () => ({
  "User-Agent": MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)],
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": BASE_URL + "/"
});

const origin = url => { try { const p = url.split('//'); return p[0] + '//' + p[1].split('/')[0]; } catch (e) { return url; } };
const fixUrl = url => !url ? '' : url.startsWith('https://') ? url : url.startsWith('http://') ? 'https://' + url.slice(7) : url.startsWith('//') ? 'https:' + url : BASE_URL + (url.startsWith('/') ? '' : '/') + url;
const normalizeQ = q => { if (!q) return null; const l = q.toLowerCase(); return (l === '4k' || l === '4kp') ? '2160p' : ALLOWED_Q.includes(l) ? l : null; };
const parseQ = t => { const m = String(t || '').match(/(2160|1080|720|480|1440)\s*P/i); return m ? m[1].toLowerCase() + 'p' : /4K|UHD/i.test(t) ? '2160p' : /1440|2K/i.test(t) ? '1440p' : 'HD'; };
const decodeEnt = s => (s || '').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-').replace(/&#038;|&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&quot;/g, '"');

async function fetchSafe(url, opts = {}, timeout = 12000) {
  try {
    return await Promise.race([
      fetch(url, { ...opts, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.5", "Accept-Encoding": "identity", ...(opts.headers || {}) } }),
      nvTimeoutRej(timeout, new Error('timeout'))
    ]);
  } catch (e) { return null; }
}
const fetchJson = async (url, opts = {}) => { try { const r = await fetchSafe(url, opts); if (!r || !r.ok) return null; return JSON.parse(await r.text()); } catch (e) { return null; } };
const fetchHtml = async (url, opts = {}) => { try { const r = await fetchSafe(url, opts); if (!r || !r.ok) return null; return cheerio.load(await r.text()); } catch (e) { return null; } };

function makeStream(_, title, url, quality, headers, mediaInfo, fallbackQ = 'HD') {
  if (!url || !url.startsWith('https://')) return null;
  const nq = normalizeQ(quality) || normalizeQ(fallbackQ);
  if (!nq || (nq === '1080p' && count1080p >= MAX_1080P)) return null;

  const t = decodeEnt(title || '').replace(/[\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const sizeM = t.match(/\[\s*(\d+(?:\.\d+)?\s*[MG]B)\s*\]/i);
  const size = sizeM ? sizeM[1].trim() : 'N/A';
  const src = /bluray|blu\-ray|bdrip/i.test(t) ? 'Blu-ray' : /hdrip|webrip/i.test(t) ? 'WEBRip' : 'WEB-DL';
  const imax = /imax/i.test(t) ? ' • IMAX' : '';
  const range = /dolby\s*vision|dovi/i.test(t) ? 'Dolby Vision' : /hdr10/i.test(t) ? 'HDR10' : /hdr/i.test(t) ? 'HDR' : /10bit|10\-bit/i.test(t) ? '10-Bit' : /sdr/i.test(t.toLowerCase()) ? 'SDR' : '';
  const codec = /hevc|x265|h265/i.test(t) ? 'H.265' : 'H.264';

  let audio = 'AAC';
  const am = t.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
  if (am) { audio = am[1].toUpperCase().replace(/\s+/g, ''); if (audio === '5.1') audio = 'DDP5.1'; if (audio.includes('TRUEHD')) audio = 'TrueHD 7.1'; }
  else if (/dolby\s*digital|dd/i.test(t)) audio = 'Dolby Digital';
  if (/atmos/i.test(t)) audio += ' • Atmos';

  const langs = /dual|hindi\-eng|eng\-hin/i.test(t) ? 'English • Hindi' : ([/english|eng/i.test(t) && 'English', /hindi|hin/i.test(t) && 'Hindi'].filter(Boolean).join(' • ') || 'English');
  const lUrl = url.toLowerCase();
  const host = (lUrl.includes('hubcloud') || lUrl.includes('/hub2/') || lUrl.includes('homelander.buzz') || lUrl.includes('whistle.lat') || lUrl.includes('mandalorian.buzz')) ? 'HubCloud' : (lUrl.includes('.r2.dev') || lUrl.includes('vcloud')) ? 'vCloud' : '';

  if (nq === '1080p') count1080p++;
  const line1 = `${langs}${size !== 'N/A' ? ` • ${size}` : ''}`;
  const line2 = `${src} • ${audio}${range ? ' • ' + range : ''} • ${codec}`;
  return {
    name: `${PROVIDER} • ${nq.toUpperCase()}${imax}${host ? ' • ' + host : ''}`,
    title: `${PROVIDER} • ${nq.toUpperCase()}${imax}${host ? ' • ' + host : ''}`,
    size: `${line1}\n${line2}`,
    url,
    _resWeight: Q_WEIGHTS[nq] || 0,
    _sizeWeight: sizeM ? parseFloat(sizeM[1]) * (sizeM[1].toUpperCase().includes('GB') ? 1024 : 1) : 0,
    behaviorHints: { notWebReady: true, proxyHeaders: { request: headers || { "Referer": BASE_URL + "/" } } }
  };
}

const dedupe = streams => { const s = new Set(); return (streams || []).filter(x => x && x.url && !s.has(x.url) && s.add(x.url)); };
const isHubVc = s => { if (!s || !s.url) return false; const l = s.url.toLowerCase(); return l.includes('hubcloud') || l.includes('vcloud') || l.includes('/hub2/') || l.includes('homelander.buzz') || l.includes('whistle.lat') || l.includes('mandalorian.buzz') || l.includes('.r2.dev') || (s.name && (s.name.includes('HubCloud') || s.name.includes('vCloud'))); };

function isStrictMatch(reqTitle, reqYear, scrTitle, scrYear, alts = []) {
  if (!scrTitle) return false;
  const sc = scrTitle.toLowerCase().replace(/download\s*/gi, '').replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
  if (![reqTitle, ...alts].filter(Boolean).some(t => { const c = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' '); return c && (sc.includes(c) || sc.startsWith(c)); })) return false;
  if (reqYear && scrYear && !isNaN(parseInt(reqYear)) && !isNaN(parseInt(scrYear)) && Math.abs(parseInt(reqYear) - parseInt(scrYear)) > 1) return false;
  return true;
}

async function getTMDBInfo(id, type) {
  const isImdb = String(id).startsWith('tt'), t = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
  try {
    if (isImdb) {
      const d = await fetchJson(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
      const list = d ? (t === 'tv' ? d.tv_results : d.movie_results) : null;
      if (list && list.length) { const i = list[0]; return { title: t === 'tv' ? i.name : i.title, year: (i.first_air_date || i.release_date || '').split('-')[0], imdbId: id, tmdbId: i.id }; }
      return { title: String(id), year: null, imdbId: id, tmdbId: null };
    }
    const d = await fetchJson(`https://api.themoviedb.org/3/${t}/${id}?api_key=${TMDB_KEY}&append_to_response=external_ids,alternative_titles`);
    if (d) {
      const alts = ((d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results)) || []).map(x => String(x.title || ''));
      return { title: t === 'tv' ? d.name : d.title, year: (d.first_air_date || d.release_date || '').split('-')[0], imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null, tmdbId: d.id, altTitles: alts };
    }
  } catch (e) { }
  return { title: String(id), year: null, imdbId: null, tmdbId: null };
}

async function searchByTitle(query, year) {
  if (!query) return [];
  const d = await fetchJson(`${BASE_URL}/search.php?q=${encodeURIComponent(query + (year ? ' ' + year : ''))}&page=1&per_page=15`, { headers: { ...mobileHdrs(), 'Accept-Encoding': 'identity' } });
  if (!d || !d.hits || !d.hits.length) return [];
  return d.hits.map(h => {
    const doc = h.document || {}, title = (doc.post_title || '').replace(/Download\s*/gi, '').trim();
    return { postId: String(doc.id || ''), title, permalink: doc.permalink || '', imdbId: doc.imdb_id || '', year: (Array.isArray(doc.category) ? doc.category.find(c => /^(19|20)\d{2}$/.test(String(c).trim())) : null) || (title.match(/\b(19|20)\d{2}\b/) || [null])[0] };
  });
}

async function fetchPostContent(postId, link) {
  if (!postId) return null;
  try {
    const r = await fetchSafe(`${BASE_URL}/wp-json/wp/v2/posts/${postId}`, { headers: mobileHdrs() }, 15000);
    if (r && r.ok) {
      const json = JSON.parse(await r.text());
      if (json && json.content && json.content.rendered && /nexdrive|vcloud|hubcloud|fastdl|genxfm/i.test(json.content.rendered))
        return { title: (json.title && json.title.rendered || '').replace(/Download\s*/gi, '').trim(), html: json.content.rendered };
    }
  } catch (e) { }
  try {
    const $ = await fetchHtml(link ? fixUrl(link) : `${BASE_URL}/?p=${postId}`, { headers: mobileHdrs() });
    if ($) { const html = $('.entry-content').html() || $('.post-content').html(); if (html) return { title: $('title').text().replace(/Download\s*/gi, '').trim(), html }; }
  } catch (e) { }
  return null;
}

function extractNexdriveLinks(html) {
  if (!html) return [];
  const $ = cheerio.load(html), seen = new Set(), links = [];
  $('a[href*="nexdrive"], a[href*="genxfm"], a[href*="fastdl"], a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !href.startsWith('https://') || seen.has(href)) return;
    const text = ($(el).text() || '').trim();
    if (EXCLUDED.some(e => text.toLowerCase().includes(e))) return;
    seen.add(href);
    let quality = 'HD', label = text || 'Download';
    const pos = html.indexOf(href);
    if (pos > 0) {
      const before = html.substring(Math.max(0, pos - 3000), pos);
      const hms = before.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
      if (hms && hms.length) { const hctx = hms[hms.length - 1].replace(/<[^>]*>/g, '').trim().replace(/Download/ig, ''); if (hctx.length > 5) label = hctx; }
      let last = null, li = -1, m, qp = /(?:^|>|\s)(\d{3,4}p|4K|UHD|HDR)(?:<|\s|$)/gi;
      while ((m = qp.exec(before)) !== null) { if (m.index > li) { li = m.index; last = m[1]; } }
      if (last) quality = parseQ(last);
      if (!quality || quality === 'HD') { const hq = before.match(/<(?:h[1-6]|strong|b)[^>]*>[^<]*?(\d{3,4}p|4K|UHD)[^<]*?<\//i); if (hq) quality = parseQ(hq[1]); }
    }
    const nq = normalizeQ(quality);
    if (nq) links.push({ href, quality: nq, label });
  });
  return links;
}

function extractSeasonFromContent(html, season) {
  if (!html || season == null) return html;
  let clean = html.split('id="comments"')[0];
  if (clean.length === html.length) clean = html.split('class="comments-area"')[0];
  const re = /(?:Season|Saison|Staffel)\s+0*(\d+)\b(?!\s*(?:-|–|to|and|&|&#))/gi;
  let m, blocks = [];
  while ((m = re.exec(clean)) !== null) {
    const ts = Math.max(clean.lastIndexOf('<h', m.index), clean.lastIndexOf('<strong', m.index));
    const start = (ts < 0 || m.index - ts > 500) ? m.index : ts;
    const ctx = clean.substring(start, m.index + 50).toLowerCase();
    if (!ctx.includes('download') && !ctx.includes('episode')) blocks.push({ season: parseInt(m[1]), index: start });
  }
  if (!blocks.length) return clean;
  const tb = blocks.find(b => b.season === season);
  if (!tb) return clean;
  const nb = blocks.find(b => b.index > tb.index && b.season !== season);
  return clean.substring(tb.index, nb ? nb.index : clean.length);
}

async function extractSingleVc(vcUrl, referer, targetSeason, targetEp, label, fallbackQ, mediaInfo) {
  const streams = [], lower = vcUrl.toLowerCase();
  if (!vcUrl.startsWith('https://') || (!lower.includes('vcloud') && !lower.includes('hubcloud') && !lower.includes('nexdrive') && !lower.includes('fastdl'))) return streams;

  const isHub = lower.includes('hubcloud'), latestBase = isHub ? HUB_DOMAIN : VC_DOMAIN, cur = origin(vcUrl);
  const newUrl = (cur !== latestBase && (vcUrl.includes('vcloud') || vcUrl.includes('hubcloud'))) ? vcUrl.replace(cur, latestBase) : vcUrl;

  const $ = await fetchHtml(newUrl, { headers: { ...mobileHdrs(), 'Referer': referer || BASE_URL + '/', 'Cookie': 'xla=s4t' }, redirect: 'manual' });
  if (!$) return streams;

  const raw = $.html(), pageTitle = $('title').text() || '';
  if (targetSeason != null || targetEp != null) {
    const sem = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]*(?:E|Ep|Episode)\s*0*(\d{1,2})[.\s_\-]/i);
    if (sem) { if (targetSeason != null && parseInt(sem[1]) !== targetSeason) return streams; if (targetEp != null && parseInt(sem[2]) !== targetEp) return streams; }
    else { const sm = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]/i); if (sm && targetSeason != null && parseInt(sm[1]) !== targetSeason) return streams; }
  }

  const headerText = $('div.card-header').text() || '';
  let quality = parseQ(headerText) || fallbackQ || 'HD';
  const tasks = [];
  const synced = href => href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes()) : href + '?s=' + (1 + new Date().getMinutes());

  const varAtob = raw.match(/var\s+url\s*=\s*atob\(atob\('([^']+)'\)\)/);
  const varUrl = raw.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
  let bridgeUrl = varAtob ? (function () { try { return atob(atob(varAtob[1])); } catch (e) { return varAtob[1]; } })() : varUrl ? varUrl[1] : '';

  if (bridgeUrl && bridgeUrl.includes('.workers.dev') && bridgeUrl.startsWith('https://')) {
    tasks.push(() => streams.push(makeStream('Worker', (label || 'Worker') + ' [' + headerText + ']', synced(bridgeUrl), quality, { 'Referer': newUrl }, mediaInfo, fallbackQ)));
    bridgeUrl = '';
  }

  const skipBtn = lt => lt.includes('10gbps') || lt.includes('gdflix') || lt.includes('dropgalaxy') || lt.includes('telegram');
  $('a.btn, a').each((_, el) => {
    const href = $(el).attr('href') || '', text = ($(el).text() || '').trim(), lt = text.toLowerCase();
    if (!href || href === '#' || !href.startsWith('https://') || href.toLowerCase().includes('.zip') || skipBtn(lt)) return;
    if (lt.includes('fslv2')) tasks.push(() => streams.push(makeStream('FSLv2', (label || text) + ' [' + headerText + ']', href, quality, { 'Referer': newUrl }, mediaInfo, fallbackQ)));
    else if (lt.includes('fsl')) tasks.push(() => streams.push(makeStream('FSL', (label || text) + ' [' + headerText + ']', synced(href), quality, { 'Referer': newUrl }, mediaInfo, fallbackQ)));
    else if (lt.includes('worker')) tasks.push(() => streams.push(makeStream('Worker', (label || text) + ' [' + headerText + ']', synced(href), quality, { 'Referer': newUrl }, mediaInfo, fallbackQ)));
  });

  if (tasks.length) { tasks.forEach(fn => fn()); return streams; }

  if (!bridgeUrl) {
    const dlHref = $('#download').attr('href') || $('a').filter((_, el) => { const h = $(el).attr('href') || ''; return h.includes('hubcloud.php') || h.includes('token') || h.includes('dl'); }).first().attr('href');
    if (dlHref && dlHref.startsWith('http')) bridgeUrl = dlHref;
  }
  if (!bridgeUrl) {
    const redir = $('a[href*="vcloud.zip"]').filter((_, el) => { const h = $(el).attr('href') || ''; return !h.includes('/api/') && h !== newUrl && h.startsWith('https://'); }).first().attr('href');
    if (redir) return extractSingleVc(redir, referer, targetSeason, targetEp, label, fallbackQ, mediaInfo);
  }
  if (!bridgeUrl) return streams;
  if (!bridgeUrl.startsWith('http')) bridgeUrl = origin(newUrl) + bridgeUrl;
  if (!bridgeUrl.startsWith('https://')) return streams;

  const $b = await fetchHtml(bridgeUrl, { headers: { ...mobileHdrs(), 'Referer': newUrl, 'Cookie': 'xla=s4t' } });
  if (!$b) return streams;
  const bHeader = $b('div.card-header').text() || '', bQ = parseQ(bHeader) || quality;
  const bVar = $b.html().match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
  if (bVar && bVar[1] && bVar[1].includes('.workers.dev') && bVar[1].startsWith('https://'))
    tasks.push(() => streams.push(makeStream('Worker', (label || 'Worker') + ' [' + bHeader + ']', synced(bVar[1]), bQ, { 'Referer': bridgeUrl }, mediaInfo, fallbackQ)));

  $b('a.btn, a').each((_, el) => {
    const href = $b(el).attr('href') || '', text = ($b(el).text() || '').trim(), lt = text.toLowerCase();
    if (!href || href === '#' || !href.startsWith('https://') || href.toLowerCase().includes('.zip') || skipBtn(lt)) return;
    if (lt.includes('fslv2')) tasks.push(() => streams.push(makeStream('FSLv2', (label || text) + ' [' + bHeader + ']', href, bQ, { 'Referer': bridgeUrl }, mediaInfo, fallbackQ)));
    else if (lt.includes('fsl')) tasks.push(() => streams.push(makeStream('FSL', (label || text) + ' [' + bHeader + ']', synced(href), quality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQ)));
  });

  if (!tasks.length) {
    const fsl = $b('#fsl').attr('href');
    if (fsl && fsl.startsWith('https://')) tasks.push(() => streams.push(makeStream('FSL', (label || 'FSL') + ' [' + headerText + ']', synced(fsl), quality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQ)));
  }
  tasks.forEach(fn => fn());
  return streams;
}

async function loadStreamsFromUrl(url, label, quality, referer, targetSeason, targetEp, mediaInfo) {
  if (!url || !url.startsWith('https://')) return [];
  const lower = url.toLowerCase();
  if (lower.includes('vcloud') || lower.includes('hubcloud')) return extractSingleVc(url, referer || url, targetSeason, targetEp, label, quality, mediaInfo);
  if (!lower.includes('nexdrive') && !lower.includes('genxfm') && !lower.includes('fastdl')) return [];

  const $ = await fetchHtml(url, { headers: { ...mobileHdrs(), 'Referer': referer || BASE_URL + '/' }, redirect: 'manual' });
  if (!$) return [];
  const streams = [], tasks = [];

  $('a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
    let href = $(el).attr('href');
    if (!href || !href.startsWith('https://')) return;
    if (href.startsWith('/')) href = origin(url) + href;
    if (href.includes('/api/index.php?link=')) {
      tasks.push(async () => {
        const $a = await fetchHtml(href, { headers: { ...mobileHdrs(), 'Referer': url }, redirect: 'manual' });
        if (!$a) return [];
        const rv = $a('a.btn-success, a.btn').attr('href');
        return (rv && rv.startsWith('https://')) ? extractSingleVc(rv.startsWith('/') ? origin(href) + rv : rv, href, targetSeason, targetEp, label, quality, mediaInfo) : [];
      });
    } else tasks.push(() => extractSingleVc(href, url, targetSeason, targetEp, label, quality, mediaInfo));
  });

  if (targetEp != null) {
    const pi = targetEp - 1;
    if (pi >= 0 && pi < tasks.length) { try { const r = await tasks[pi](); if (r && r.length) { r.forEach(s => s && s.url && streams.push(s)); return streams; } } catch (e) { } }
    for (let i = 0; i < tasks.length; i += 5) {
      if (i === Math.floor(pi / 5) * 5) continue;
      const res = await Promise.all(tasks.slice(i, i + 5).map(fn => fn().catch(() => [])));
      let found = false;
      res.forEach(r => { if (r && r.length) { r.forEach(s => s && s.url && streams.push(s)); found = true; } });
      if (found) break;
    }
  } else {
    for (let i = 0; i < tasks.length; i += 5) {
      const res = await Promise.all(tasks.slice(i, i + 5).map(fn => fn().catch(() => [])));
      res.forEach(r => Array.isArray(r) && r.forEach(s => s && s.url && streams.push(s)));
    }
  }
  return streams;
}

async function extractFromPost(post, label, isTv, targetSeason, targetEp, mediaYear) {
  try {
    let html = post.html, seasonLabel = '';
    if (isTv && targetSeason != null) { html = extractSeasonFromContent(html, targetSeason) || html; seasonLabel = ' S' + targetSeason + (targetEp ? 'E' + targetEp : ''); }
    const mediaInfo = (seasonLabel.trim() || mediaYear || '').trim();
    const links = extractNexdriveLinks(html).slice(0, 15);
    if (!links.length) return [];
    const results = await Promise.all(links.map(l => loadStreamsFromUrl(l.href, l.label || (seasonLabel + '[' + l.quality + ']'), l.quality, BASE_URL + '/', targetSeason, targetEp, mediaInfo).catch(() => [])));
    return results.flat();
  } catch (e) { return []; }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    count1080p = 0;
    const isTv = mediaType === 'tv' || mediaType === 'series';
    const media = await getTMDBInfo(tmdbId, mediaType);
    const { title: mediaTitle, year: mediaYear, altTitles = [] } = media;
    const imdbId = (!media.imdbId || !media.imdbId.startsWith('tt')) && String(tmdbId).startsWith('tt') ? String(tmdbId) : media.imdbId;

    let results = [];
    if (imdbId && imdbId.startsWith('tt')) results = await searchByTitle(imdbId, null);
    if (!results.length || !results.some(r => r.imdbId === imdbId)) {
      let q = mediaTitle + (isTv && season != null ? ' season ' + Number(season) : mediaYear ? ' ' + mediaYear : '');
      results = await searchByTitle(q, mediaYear);
      if (!results.length && isTv && season != null) results = await searchByTitle(mediaTitle, mediaYear);
    }
    if (!results.length) return [];

    let best = null;
    const targetImdb = imdbId && imdbId.startsWith('tt') ? imdbId : null;
    for (const r of results) {
      if (targetImdb && r.imdbId === targetImdb) {
        if (!isTv || !season) { best = r; break; }
        const range = /(?:s|season|staffel|saison)\s*0*(\d+)\s*(?:-|–|to|and|&|&#)\s*0*(\d+)\b/i.exec(r.title);
        const inRange = range && parseInt(season) >= parseInt(range[1]) && parseInt(season) <= parseInt(range[2]);
        if (inRange || new RegExp('(?:s|season|staffel|saison)\\s*0*' + Number(season) + '\\b', 'i').test(r.title)) { best = r; break; }
      }
      if (!best && isStrictMatch(mediaTitle, mediaYear, r.title, r.year, altTitles)) best = r;
    }
    if (!best || !best.postId) return [];

    const post = await fetchPostContent(best.postId, best.permalink);
    if (!post) return [];

    const streams = await extractFromPost(post, post.title || best.title, isTv, season != null ? Number(season) : null, episode != null ? Number(episode) : null, mediaYear);
    return dedupe(streams).filter(isHubVc).sort((a, b) => b._resWeight - a._resWeight || b._sizeWeight - a._sizeWeight);
  } catch (e) { count1080p = 0; return []; }
}

module.exports = { getStreams };