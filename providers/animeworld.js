"use strict";
// animeworld.js - eclipsia onyxia.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: lite.
// Subtitles: passed through as upstream emits them (English/Tagalog tracks kept when upstream provides).

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
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://watchanimeworld.one";
const PLAYER_BASE_URL = "https://play.zephyrix.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const HEADER = { "User-Agent": USER_AGENT };

async function performGetRequest(url, headers = {}) {
  const response = await fetch(url, { headers: { ...HEADER, ...headers } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function performPostRequest(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...HEADER, "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchFromTmdb(path) {
  try {
    const response = await fetch(`${TMDB_API_URL}/${path}?api_key=${TMDB_API_KEY}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function searchAnimeSite(title, mediaType) {
  try {
    const response = await performGetRequest(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { "Referer": `${BASE_URL}/` });
    const html = await response.text();
    const $ = cheerio.load(html);
    const seenUrls = new Set();
    const results = [];

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href") || "";
      const match = href.match(/^https?:\/\/[^/]+\/(series|movies)\/([^/]+)\//);
      if (!match || match[2] === "page" || seenUrls.has(href)) return;
      const isCorrectType = mediaType === "movie" ? match[1] === "movies" : match[1] === "series";
      if (!isCorrectType) return;
      seenUrls.add(href);
      results.push(href);
    });

    return results;
  } catch {
    return [];
  }
}

async function resolveEpisodeUrl(seriesUrl, seasonNumber, episodeNumber) {
  const response = await performGetRequest(seriesUrl, { "Referer": `${BASE_URL}/` });
  const html = await response.text();
  const epPattern = `${seasonNumber}x${episodeNumber}`;
  const postIdMatch = html.match(/postid-(\d+)/) || html.match(/data-post="(\d+)"/);

  if (postIdMatch) {
    try {
      const ajaxResponse = await performGetRequest(
        `${BASE_URL}/wp-admin/admin-ajax.php?action=action_select_season&season=${seasonNumber}&post=${postIdMatch[1]}`,
        { "Referer": seriesUrl }
      );
      const ajaxHtml = await ajaxResponse.text();
      const url = findEpisodeInHtml(ajaxHtml, epPattern);
      if (url) return url;
    } catch {
      // fall through
    }
  }

  return findEpisodeInHtml(html, epPattern);
}

function findEpisodeInHtml(html, epPattern) {
  const re = /href="(https?:\/\/[^"]+\/episode\/([^"]+))"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes(epPattern) || m[2].includes(epPattern)) return m[1];
  }
  return null;
}

async function extractStreamData(pageUrl) {
  const response = await performGetRequest(pageUrl, { "Referer": `${BASE_URL}/` });
  const html = await response.text();

  let streamMatch = html.match(/(?:src|data-src)="(https?:\/\/play\.[^"]+\/video\/([a-f0-9]+))"/i);
  if (!streamMatch) {
    const loose = html.match(/https?:\/\/play\.(zephyrflick|zephyrix)\.[^/\s"]+\/video\/([a-f0-9]+)/i);
    if (loose) streamMatch = [null, `${PLAYER_BASE_URL}/video/${loose[2]}`, loose[2]];
  }
  if (!streamMatch) return null;

  const playerPageUrl = streamMatch[1];
  const videoHash = streamMatch[2];

  let sessionCookie = "";
  try {
    const playerPageRes = await fetch(playerPageUrl, {
      headers: { ...HEADER, "Referer": `${BASE_URL}/` }
    });
    const rawCookie = playerPageRes.headers.get("set-cookie") || "";
    sessionCookie = rawCookie
      .split(/,(?=[^;]+=[^;]+)/)
      .map(c => c.trim().split(";")[0])
      .filter(Boolean)
      .join("; ");
  } catch {
    // non-fatal
  }

  const postHeaders = {
    "Referer": playerPageUrl,
    "Origin": PLAYER_BASE_URL,
    "X-Requested-With": "XMLHttpRequest",
    ...(sessionCookie ? { "Cookie": sessionCookie } : {})
  };

  const postData = await performPostRequest(
    `${PLAYER_BASE_URL}/player/index.php?data=${videoHash}&do=getVideo`,
    `hash=${videoHash}&r=${encodeURIComponent(`${BASE_URL}/`)}`,
    postHeaders
  );

  const m3u8Url = postData.securedLink || postData.videoSource || postData.source || postData.file;
  if (!m3u8Url) return null;

  const hashMatch = m3u8Url.match(/\/cdn\/hls\/([a-f0-9]+)\//);
  const contentHash = hashMatch ? hashMatch[1] : videoHash;

  return {
    url: m3u8Url,
    streamHeaders: {
      "Referer": `${PLAYER_BASE_URL}/`,
      "Origin": PLAYER_BASE_URL,
      "User-Agent": USER_AGENT,
      ...(sessionCookie ? { "Cookie": sessionCookie } : {})
    },
    subtitle: `${PLAYER_BASE_URL}/cdn/down/${contentHash}/Subtitle/subtitle_eng.srt`
  };
}

async function getStreams(tmdbId, mediaType = "tv", seasonNumber = 1, episodeNumber = 1) {
  try {
    if (mediaType === "tv" && (seasonNumber == null || episodeNumber == null)) return [];

    const [mediaEntry, seasonEpisodes] = await Promise.all([
      fetchFromTmdb(`${mediaType}/${tmdbId}`),
      mediaType === "tv" ? fetchFromTmdb(`tv/${tmdbId}/season/${seasonNumber}`) : Promise.resolve(null)
    ]);

    if (!mediaEntry) return [];
    const mediaTitle = mediaEntry.name || mediaEntry.title;
    if (!mediaTitle) return [];

    if (mediaType === "tv" && seasonEpisodes?.episodes) {
      const episodeNumberInt = parseInt(episodeNumber, 10) || 1;
      seasonEpisodes.episodes.find(ep => ep.episode_number === episodeNumberInt);
    }

    const searchResults = await searchAnimeSite(mediaTitle, mediaType);
    if (!searchResults.length) return [];

    let streamData = null;

    if (mediaType === "movie") {
      streamData = await extractStreamData(searchResults[0]);
    } else {
      let episodeUrl = await resolveEpisodeUrl(searchResults[0], seasonNumber, episodeNumber);
      if (!episodeUrl && seasonNumber !== 1) {
        episodeUrl = await resolveEpisodeUrl(searchResults[0], 1, episodeNumber);
      }
      if (episodeUrl) streamData = await extractStreamData(episodeUrl);
    }

    if (!streamData) return [];

    return [{
      name: "AnimeWorld • Zephyrix",
      title: "AnimeWorld • Zephyrix",
      url: streamData.url,
      quality: "1080p",
      headers: streamData.streamHeaders,
      subtitles: streamData.subtitle
        ? [{ url: streamData.subtitle, language: "en", name: "English" }]
        : []
    }];
  } catch {
    return [];
  }
}

module.exports = { getStreams };