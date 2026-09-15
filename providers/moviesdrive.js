"use strict";

// moviesdrive.js - eclipsia vornix.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: lite, qs.
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
"use strict"

const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://new3.moviesdrive.christmas";
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive",
};

const HUBCLOUD_SERVER_LABELS = new Map([
  ["r2.dev", "Direct R2"],
  ["workers.dev", "ZipDisk"],
  ["fsl server", "FSL"],
  ["s3 server", "S3"],
  ["fslv2", "FSLv2"],
  ["mega server", "Mega"],
]);

async function fetchTmdbMeta(tmdbId, mediaType) {
  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || data.name || "",
      imdbId: data.external_ids?.imdb_id ?? null,
    };
  } catch {
    return null;
  }
}

async function extractHubCloudLinks(url, referer) {
  try {
    let currentUrl = url.replace("hubcloud.ink", "hubcloud.dad");
    let html = await (await fetch(currentUrl, { headers: { ...REQUEST_HEADERS, Referer: referer } })).text();

    if (!currentUrl.includes("hubcloud.php")) {
      const $first = cheerio.load(html);
      let nextUrl = $first("#download").attr("href")
        || (html.match(/var url = '([^']*)'/) || [])[1]
        || "";

      if (nextUrl) {
        if (!nextUrl.startsWith("http")) {
          const base = new URL(currentUrl);
          nextUrl = `${base.protocol}//${base.hostname}/${nextUrl.replace(/^\//, "")}`;
        }
        html = await (await fetch(nextUrl, { headers: { ...REQUEST_HEADERS, Referer: currentUrl } })).text();
        currentUrl = nextUrl;
      }
    }

    const $ = cheerio.load(html);
    const size = $("i#size").text().trim();
    const header = $("div.card-header").text().trim();
    const qMatch = header.match(/(\d{3,4})[pP]/);
    const quality = qMatch ? parseInt(qMatch[1]) : 1080;

    const results = [];
    for (const el of $("a.btn").get()) {
      const link = $(el).attr("href") || "";
      const text = $(el).text().toLowerCase();

      const isValidLink =
        text.includes("download file") ||
        text.includes("fsl server") ||
        text.includes("s3 server") ||
        text.includes("fslv2") ||
        text.includes("mega server") ||
        link.includes("r2.dev");

      if (!isValidLink) continue;

      let serverLabel = "HubCloud";
      for (const [key, label] of HUBCLOUD_SERVER_LABELS) {
        if (link.includes(key) || text.includes(key)) { serverLabel = label; break; }
      }

      results.push({ name: serverLabel, quality, url: link, size });
    }

    return results;
  } catch {
    return [];
  }
}

async function dispatchExtractor(url, referer) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("hubcloud")) return extractHubCloudLinks(url, referer);
    return [];
  } catch {
    return [];
  }
}

async function resolveServerLinks(url) {
  try {
    const html = await (await fetch(url, { headers: { ...REQUEST_HEADERS } })).text();

    if (url.includes("search-recover.php")) {
      const qMatch = html.match(/const Q_INITIAL\s*=\s*"([^"]+)"/);
      const tokenMatch = html.match(/const FROM_AC_TOKEN\s*=\s*"([^"]+)"/);

      if (qMatch && tokenMatch) {
        const base = url.split("?")[0];
        const params = nvQs({ api: "search", q: qMatch[1], page: "1", from_ac: tokenMatch[1] });
        const data = await (await fetch(`${base}?${params}`, {
          headers: { ...REQUEST_HEADERS, Accept: "application/json" },
        })).json();
        if (data.hits) return data.hits.map(h => h.url).filter(Boolean);
      }
    }

    const $ = cheerio.load(html);
    return $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(href => /hubcloud/i.test(href));
  } catch {
    return [];
  }
}

function buildStreamEntry(stream, displayTitle) {
  return {
    name: `MoviesDrive • ${stream.name}`,
    title: `MoviesDrive • ${stream.name}`,
    url: stream.url,
    quality: stream.quality,
    ...(stream.size ? { size: stream.size } : {}),
  };
}

function parseSizeBytes(sizeStr) {
  const match = (sizeStr || "").match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") return val * 1073741824;
  if (unit === "MB") return val * 1048576;
  if (unit === "KB") return val * 1024;
  return 0;
}

function applyStreamLimits(streams) {
  const seen = new Set();
  const deduped = streams.filter(s => s.url && s.quality >= 1080 && !seen.has(s.url) && seen.add(s.url));

  const above1080 = deduped
    .filter(s => s.quality > 1080)
    .sort((a, b) => parseSizeBytes(b.size) - parseSizeBytes(a.size))
    .slice(0, 3);
  const at1080 = deduped
    .filter(s => s.quality === 1080)
    .sort((a, b) => parseSizeBytes(b.size) - parseSizeBytes(a.size))
    .slice(0, 2);

  return [...above1080, ...at1080];
}

async function resolveMovieStreams(downloadLinks, referer, displayTitle) {
  const results = [];
  for (const link of [...new Set(downloadLinks)]) {
    const serverUrls = await resolveServerLinks(link);
    const groups = await Promise.all(serverUrls.map(u => dispatchExtractor(u, referer)));
    for (const group of groups) {
      for (const s of group) results.push(buildStreamEntry(s, displayTitle));
    }
  }
  return results;
}

async function resolveEpisodeStreams(pageUrl, season, episode, displayTitle) {
  try {
    const html = await (await fetch(pageUrl, { headers: REQUEST_HEADERS })).text();
    const $ = cheerio.load(html);
    const epRegex = new RegExp(`Ep${String(episode).padStart(2, "0")}|Ep${episode}`, "i");
    const results = [];

    const epEntries = $("h5").filter((_, el) => epRegex.test($(el).text())).get();
    for (const entry of epEntries) {
      const epLinks = [
        $(entry).next().find("a").attr("href"),
        $(entry).next().next().find("a").attr("href"),
      ].filter(Boolean);

      const groups = await Promise.all(epLinks.map(u => dispatchExtractor(u, pageUrl)));
      for (const group of groups) {
        for (const s of group) results.push(buildStreamEntry(s, displayTitle));
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === "tv" && season == null) return [];

  const meta = await fetchTmdbMeta(tmdbId, mediaType);
  if (!meta?.imdbId) return [];

  const { title, imdbId } = meta;

  try {
    const searchRes = await fetch(`${BASE_URL}/search.php?q=${imdbId}`, { headers: REQUEST_HEADERS });
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const match = (searchData.hits || [])
      .map(h => h.document)
      .find(d => d.imdb_id === imdbId);

    if (!match) return [];

    const pageUrl = match.permalink.startsWith("http") ? match.permalink : `${BASE_URL}${match.permalink}`;
    const pageHtml = await (await fetch(pageUrl, { headers: REQUEST_HEADERS })).text();
    const $ = cheerio.load(pageHtml);

    let streams = [];

    if (mediaType === "movie") {
      const downloadLinks = $("h5 > a").map((_, el) => $(el).attr("href")).get();
      streams = await resolveMovieStreams(downloadLinks, pageUrl, title);
    } else {
      const seasonRegex = new RegExp(`Season ${season}`, "i");
      const seasonEntries = $("h5").filter((_, el) => seasonRegex.test($(el).text())).get();
      const displayTitle = `${title} S${season}E${episode}`;

      for (const entry of seasonEntries) {
        const seasonPageUrl = $(entry).next().find("a").attr("href");
        if (!seasonPageUrl) continue;
        const epStreams = await resolveEpisodeStreams(seasonPageUrl, season, episode, displayTitle);
        streams.push(...epStreams);
      }
    }

    return applyStreamLimits(streams);
  } catch {
    return [];
  }
}

module.exports = { getStreams };