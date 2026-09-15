/* ===== nv-plugins device polyfills v1.0.1 (pack 4.39.0, 2026-09-14) ============
   The Nuvio QuickJS plugin runtime (quickjs-kt 1.0.5-nuvio AAR) is a bare
   ES2020 realm: no atob/btoa, no URLSearchParams, no TextDecoder, no timers.
   These polyfills are define-only-if-missing, so node/desktop runtimes are
   completely unaffected. (v1.0.0 proven in pack 4.37.0 across 12 providers.)
============================================================================ */
(function () {
  var G = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this);
  if (typeof G.atob !== 'function') {
    var _CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    G.atob = function (s) {
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
    G.btoa = function (s) {
      s = String(s);
      var out = '', i;
      for (i = 0; i < s.length; i += 3) {
        var b0 = s.charCodeAt(i), b1 = s.charCodeAt(i + 1), b2 = s.charCodeAt(i + 2);
        var has1 = !(i + 1 >= s.length || isNaN(b1)), has2 = !(i + 2 >= s.length || isNaN(b2));
        out += _CH2.charAt(b0 >> 2);
        out += _CH2.charAt(((b0 & 3) << 4) | (has1 ? b1 >> 4 : 0));
        out += has1 ? _CH2.charAt(((b1 & 15) << 2) | (has2 ? b2 >> 6 : 0)) : '=';
        out += has2 ? _CH2.charAt(b2 & 63) : '=';
      }
      return out;
    };
  }
  if (typeof G.URLSearchParams !== 'function') {
    var USP = function (init) {
      this._m = {};
      if (init && typeof init === 'object') {
        for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) this._m[k] = [String(init[k])];
      }
    };
    USP.prototype.append = function (k, v) { (this._m[k] = this._m[k] || []).push(String(v)); };
    USP.prototype.set = function (k, v) { this._m[k] = [String(v)]; };
    USP.prototype.get = function (k) { var a = this._m[k]; return a && a.length ? a[0] : null; };
    USP.prototype.has = function (k) { return Object.prototype.hasOwnProperty.call(this._m, k); };
    USP.prototype.toString = function () {
      var out = [];
      for (var k in this._m) {
        if (!Object.prototype.hasOwnProperty.call(this._m, k)) continue;
        var vs = this._m[k];
        for (var i = 0; i < vs.length; i++)
          out.push(encodeURIComponent(k).replace(/%20/g, '+') + '=' + encodeURIComponent(vs[i]).replace(/%20/g, '+'));
      }
      return out.join('&');
    };
    G.URLSearchParams = USP;
  }
})();

// providers/animotvslash.js
// v7.1.0 (2026-09-15): device-killer fix (pack 4.43.1 review) - fetchWithCookies
//   and parseHlsVariants called the runtime's fetch() with NO timeout cap. The
//   device fetch bridge just HANGS on a black-holed host (TCP connect to a
//   blocked IP never settles), so a dead animotvslash.org / tryembed / plyr CDN
//   stalled that lane forever and burned the app's 60s plugin budget -> zero
//   rows. Fix: repo-standard guarded fetchWithTimeout (hasTimers() gate - the
//   QuickJS device realm has NO timers, so bare fetch is kept there and the
//   app's budget stays the hard cap; with timers we race a 15s cap per request,
//   12s for the master-playlist variant probe). Same pattern proven on devices
//   by asianhub 2.3.0 / pinoyhub 5.5.0 / pencuri 1.2.0. All fetchWithCookies
//   callers already try/catch or .catch, so a timeout now degrades that lane to
//   null/skipped instead of stalling it. No lane logic changed.
// v7.0.0 (2026-09-13): RESTORED the device-proven v5.4.0 implementation as the
// base (the 4.30.0 v6.0.0 rewrite dropped too much of it and gave users zero
// streams) and grafted the site's own MegaPlay fallback lane onto it:
//   - the .ru watch player falls back to megaplay.buzz/stream/ani/{anilistId}/
//     {ep}/{sub|dub} -> getSourcesNew -> AES "enc" payload -> tokenized master
//   - the fallback fires whenever the site's own extract lanes (plyr/videas,
//     tryembed, admin-ajax) yield nothing, including the asian-catalog direct
//     lane; ani ids come from .ru/watch embeds in the episode page, or from
//     api.ani.zip themoviedb_id -> anilist_id when the site is unreachable
//   - the v5.4.0 quality whitelist (Auto+480/720/1080) covers MegaPlay rows
//   - crypto via the app's own require('crypto-js') (device polyfill) first;
//     the Nuvio runtime has NO __nvRequire - probing it first and giving up
//     is exactly what zeroed miruro v2.8.0 on devices
// v5.4.0 (2026-09-11): user-requested quality whitelist - "filter
// animotvslash.js 480/720/1080p/auto only". finishStreams now keeps ONLY
// Auto (adaptive master) + 480p + 720p + 1080p rows; everything else
// (240p/360p/1440p/4K/CAM labels the site may serve) is dropped before the
// streams leave the provider. The Auto master is kept because the site's
// own player picks from the same variant ladder and Nuvio's player adapts.
// v5.3.0 (2026-09-10): asian-catalog v4.0.0 pairing — DIRECT lane for
// source-scoped catalog rows:
//   - asian:an-<slug> (TMDB-unmatched rows of the animo-latest catalog)
//     navigates the site's own page structure directly:
//     /anime/{slug}/ -> real -episode-{n}/ link -> extract. Zero title
//     searching (the same fix pinoyhub 5.4.0 / asianhub 2.2.0 got).
//   - Generic asian:<slug> rows (stale CDN cache) also route here as an
//     an- lane with the de-slugged title.
//   - asian:kh-<id> rows are owned by the AsianHub kisskh lane -> skipped
//     fast (no wasted TMDB/search work).
// v5.2.0: app arg-shape hardening, same failure class as
// pinoyhub 5.6.0 ("movies work / series don't"):
//   - IMDb tt-id inputs (app without TMDB key) resolved via the TMDB find
//     API with the authoritative movie/tv type pinned from the hit.
//   - Media-type slot aliases "series"/"show"/"tv_show" normalized to "tv"
//     (NuvioTVSmart passes the catalog type verbatim).
//   - Missing/null season+episode on a TV id no longer returns zero rows:
//     proceeds with S1E1 (app's own testScraper convention).
//   - Season/episode forms '01'/'S01'/'E02' normalized via epNum().
// v5.1.0: slug-guess 404s fixed with a real search fallback. Anime titles
// romanize inconsistently (TMDB "Naruto Shippūden" -> slug "naruto-shippden"
// but the site uses "naruto-shippuuden"); no static map can guess every
// romanization, so when the direct slug candidates 404 we now run the
// site's own WordPress search (?s=), match rows by title, fetch the
// /anime/{slug}/ page and pick the real -episode-{n}/ link from it. Also
// transliterates Latin macrons in slugify so fewer titles need the fallback.
// KNOWN LIMITATION (site-side migration, audited live 2026-09-10): the site
// is moving its players from the extractable plyr/jw configs to device-bound
// SPA players (animotvslash.ru/watch SPA + animotvslash.p2pplay.pro). The
// p2pplay player requires an encrypted /api/v1/info payload plus a
// session token signed from browser fingerprints (sessionId/userId/playerId)
// - a plain HTTP client cannot mint one, so episode pages whose iframe is
// p2pplay/.ru fail soft with zero streams. Pages still on the plyr/jw
// configs (and tryembed, when it returns) extract as before.
// v5.0.0: the site dropped tryembed.us.cc for most episode pages and now
// embeds a self-hosted player: animotvslash.org/plyr-player/{base64}
// where base64 is a JSON config whose .url is a DIRECT, HEADERLESS
// cdn.videas.fr HLS master playlist (verified 200 with zero custom
// headers, variants 360p/480p/720p/1080p). tryembed + admin-ajax paths
// are kept as fallbacks for pages the site has not migrated yet.

const TMDB_API_KEY = '6dc830f9624b43261325bed3bf7d0dfa';

const ONE_PIECE_SEASON_OFFSET = {
  1: 1, 2: 62, 3: 93, 4: 131, 5: 159, 6: 196, 7: 207, 8: 230,
  9: 264, 10: 279, 11: 293, 12: 303, 13: 317, 14: 337, 15: 354,
  16: 382, 17: 391, 18: 409, 19: 419, 20: 430, 21: 446, 22: 460, 23: 1156,
};

const SLUG_OVERRIDES = {
  "303460": "the-strongest-occupation-is-not-a-hero-or-a-sage-but-an-appraiser-provisional",
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://animotvslash.org/',
};

const EMBED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://tryembed.us.cc',
  'Referer': 'https://tryembed.us.cc/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// Token cache to avoid repeated API calls
const tokenCache = {};

let cookieJar = {};

function extractCookies(response) {
  const cookies = {};
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    setCookie.split(',').forEach(cookie => {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (match) cookies[match[1].trim()] = match[2].trim();
    });
  }
  return cookies;
}

function buildCookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeCookies(newCookies) {
  cookieJar = { ...cookieJar, ...newCookies };
}

// v7.1.0 device-killer fix: every request is now capped. hasTimers() gate
// mirrors pencuri/pinoyhub/asianhub - the QuickJS device realm has no
// setTimeout, so there we call fetch bare (the native fetch bridge owns the
// wait; the app's 60s plugin budget is the hard cap) instead of throwing
// ReferenceError on the timer call (the 4.13.0 zero-rows device bug).
function hasTimers() {
  return typeof setTimeout === 'function';
}

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  if (!hasTimers()) return fetch(url, options);
  let timer = null;
  const killer = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('fetch timeout')), ms);
  });
  try {
    return await Promise.race([fetch(url, options), killer]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithCookies(url, options = {}) {
  // timeoutMs rides alongside the fetch init; strip it before spreading.
  const { timeoutMs, ...fetchOpts } = options;
  const cookieHeader = buildCookieHeader();
  const headers = {
    ...(options.headers || HEADERS),
    ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
  };

  const res = await fetchWithTimeout(url, {
    ...fetchOpts,
    headers,
    redirect: 'follow',
  }, timeoutMs || FETCH_TIMEOUT_MS);

  const newCookies = extractCookies(res);
  if (Object.keys(newCookies).length > 0) {
    mergeCookies(newCookies);
  }

  return res;
}

async function fetchHTMLWithCookies(url) {
  try {
    const res = await fetchWithCookies(url, { headers: HEADERS });
    const finalUrl = res.url;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { html, finalUrl };
  } catch (err) {
    console.error(`[animotvslash] fetch error ${url}:`, err.message);
    return { html: null, finalUrl: url };
  }
}

async function fetchJSONWithCookies(url, customHeaders) {
  try {
    const res = await fetchWithCookies(url, { headers: customHeaders || HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function slugify(title) {
  return stripAccents(String(title || '').toLowerCase())
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

var ACCENT_LATIN = {
  'Ā': 'A', 'ā': 'a', 'Ă': 'A', 'ă': 'a', 'Ą': 'A', 'ą': 'a',
  'Ć': 'C', 'ć': 'c', 'Č': 'C', 'č': 'c',
  'Ď': 'D', 'ď': 'd', 'Đ': 'D', 'đ': 'd',
  'Ē': 'E', 'ē': 'e', 'Ė': 'E', 'ė': 'e', 'Ę': 'E', 'ę': 'e', 'Ě': 'E', 'ě': 'e',
  'Ğ': 'G', 'ğ': 'g', 'Ģ': 'G', 'ģ': 'g',
  'Ī': 'I', 'ī': 'i', 'Į': 'I', 'į': 'i', 'İ': 'I', 'ı': 'i',
  'Ķ': 'K', 'ķ': 'k',
  'Ĺ': 'L', 'ĺ': 'l', 'Ļ': 'L', 'ļ': 'l', 'Ł': 'L', 'ł': 'l',
  'Ń': 'N', 'ń': 'n', 'Ņ': 'N', 'ņ': 'n', 'Ň': 'N', 'ň': 'n',
  'Ō': 'O', 'ō': 'o', 'Ő': 'O', 'ő': 'o', 'Œ': 'Oe', 'œ': 'oe',
  'Ŕ': 'R', 'ŕ': 'r', 'Ř': 'R', 'ř': 'r',
  'Ś': 'S', 'ś': 's', 'Š': 'S', 'š': 's', 'Ş': 'S', 'ş': 's',
  'Ť': 'T', 'ť': 't', 'Ŧ': 'T', 'ŧ': 't',
  'Ū': 'U', 'ū': 'u', 'Ů': 'U', 'ů': 'u', 'Ű': 'U', 'ű': 'u', 'Ų': 'U', 'ų': 'u',
  'Ŵ': 'W', 'ŵ': 'w', 'Ÿ': 'Y', 'Ź': 'Z', 'ź': 'z', 'Ż': 'Z', 'ż': 'z', 'Ž': 'Z', 'ž': 'z'
};

function stripAccents(s) {
  return String(s || '').replace(/[\u0100-\u017f]/g, function (ch) {
    return ACCENT_LATIN[ch] !== undefined ? ACCENT_LATIN[ch] : ch;
  });
}

/** Loose title key for search-row matching: accents out, alnum only. */
function titleKey(s) {
  return stripAccents(String(s || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function getTmdbInfoAuto(tmdbId) {
    var movieUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return fetchJSONWithCookies(movieUrl).then(function(data) {
        var title = data.title || "";
        var original = data.original_title || title;
        var year = (data.release_date || "").split("-")[0];
        return { type: "movie", title: title, original: original, year: year, raw: data };
    }).catch(function() {
        var tvUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
        return fetchJSONWithCookies(tvUrl).then(function(data) {
            var title = data.name || "";
            var original = data.original_name || title;
            var year = (data.first_air_date || "").split("-")[0];
            return { type: "tv", title: title, original: original, year: year, raw: data };
        });
    }).catch(function() {
        return { type: "", title: "", original: "", year: "", raw: null };
    });
}

async function getPostId(pageHtml, slug) {
  let match = pageHtml.match(/<link rel="shortlink" href="[^"]*\?p=(\d+)"/);
  if (match) return match[1];
  match = pageHtml.match(/"post_id":"(\d+)"/);
  if (match) return match[1];
  match = pageHtml.match(/\/wp-json\/wp\/v2\/posts\/(\d+)/);
  if (match) return match[1];
  match = pageHtml.match(/data-post-id="(\d+)"/);
  if (match) return match[1];
  match = pageHtml.match(/\?p=(\d+)/);
  if (match) return match[1];

  const apiUrl = `https://animotvslash.org/wp-json/wp/v2/posts?slug=${slug}`;
  const data = await fetchJSONWithCookies(apiUrl);
  if (data && data.length > 0) return data[0].id;

  return null;
}

function extractAnimeId(html, postId) {
  const embedMatch = html.match(/tryembed\.us\.cc\/embed\/anime\/(\d+)/);
  if (embedMatch) return embedMatch[1];

  const dataMatch = html.match(/data-anime-id=["'](\d+)["']/i);
  if (dataMatch) return dataMatch[1];

  const jsMatch = html.match(/anime[_-]?id\s*[:=]\s*["']?(\d+)["']?/i);
  if (jsMatch) return jsMatch[1];

  const jsonMatch = html.match(/"animeId"\s*:\s*(\d+)/);
  if (jsonMatch) return jsonMatch[1];

  const anyEmbed = html.match(/tryembed[^\d]*(\d{3,})/i);
  if (anyEmbed) return anyEmbed[1];

  if (postId) {
    console.log(`[animotvslash] Fallback: post_id=${postId} as anime_id`);
    return postId;
  }

  return null;
}

// ------------------------------------------------------------------
// SELF-HOSTED PLYR PLAYER (v5.0.0 primary path)
// ------------------------------------------------------------------

function b64Decode(str) {
  try {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    while (s.length % 4) s += '=';
    var bin;
    if (typeof atob === 'function') {
      bin = atob(s);
    } else {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      var out = '';
      var bc = 0, bs = 0, buffer, i = 0;
      // eslint-disable-next-line no-cond-assign
      while (buffer = s.charAt(i++)) {
        buffer = chars.indexOf(buffer);
        if (~buffer) {
          bs = bc % 4 ? bs * 64 + buffer : buffer;
          // eslint-disable-next-line no-unused-expressions
          bc++ % 4 ? out += String.fromCharCode(255 & bs >> ((-2 * bc) & 6)) : 0;
        }
      }
      bin = out;
    }
    try { return decodeURIComponent(escape(bin)); } catch (e2) { return bin; }
  } catch (e) {
    return '';
  }
}

function decodePlayerConfigs(html) {
  if (!html) return [];
  // The site self-hosts player wrappers that embed a base64 JSON config:
  //   animotvslash.org/plyr-player/{b64}  -> cdn.videas.fr HLS
  //   animotvslash.org/jw-player/{b64}    -> rumble.com HLS
  // Same JSON shape ({url, poster, download_url...}) for both.
  var out = [], seen = {};
  var re = /animotvslash\.org\/[a-z-]*player\/([A-Za-z0-9+/=_-]{20,})/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    var raw = b64Decode(m[1]);
    if (!raw || raw.indexOf('{') === -1) continue;
    try {
      var cfg = JSON.parse(raw);
      if (cfg && cfg.url && /^https?:\/\//i.test(cfg.url)) out.push(cfg);
    } catch (e) {}
  }
  return out;
}

function absolutizeUrl(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf('//') === 0) return 'https:' + rel;
  if (rel.charAt(0) === '/') {
    var m = base.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] + rel : rel;
  }
  return base.substring(0, base.lastIndexOf('/') + 1) + rel;
}

// The plyr master playlist is public (headerless) — parse its variants so
// Nuvio gets concrete quality rows instead of a single blind Auto row.
function parseHlsVariants(masterUrl) {
  // v7.1.0: was a bare fetch() - now capped (12s, headerless exactly as
  // before: the plyr master is public, keep the request shape identical).
  return fetchWithTimeout(masterUrl, {}, 12000).then(function (res) {
    if (!res.ok) return [];
    return res.text().then(function (txt) {
      if (txt.indexOf('#EXT-X-STREAM-INF') === -1) return [];
      var out = [];
      var lines = txt.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
          var nm = line.match(/NAME="([^"]+)"/i);
          var label = nm ? nm[1] : (line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
          if (label && /^\d+$/.test(String(label))) label = label + 'p';
          var j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length) {
            var u = lines[j].trim();
            if (u && u.charAt(0) !== '#') {
              out.push({ name: label || 'Auto', url: absolutizeUrl(masterUrl, u) });
              i = j;
            }
          }
        }
      }
      return out;
    });
  }).catch(function () { return []; });
}

function variantRank(name) {
  var m = String(name || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

// v5.4.0: user-requested quality whitelist - 480p / 720p / 1080p / Auto only.
// Empty labels are kept (the Auto/adaptive rows never carry a number);
// every other label must contain 480 / 720 / 1080 to survive - anything
// else (240p, 360p, 1440p, 2160p, 4K, word labels) is dropped.
function animoQualityAllowed(q) {
  var s = String(q == null ? '' : q).trim().toLowerCase();
  if (!s || s === 'auto') return true;
  var m = s.match(/(\d{3,4})/);
  if (!m) return false;
  var n = parseInt(m[1], 10);
  return n === 480 || n === 720 || n === 1080;
}

async function getEmbedUrl(postId, pageHtml, episodeNum) {
  const htmlEmbed = scrapeEmbedFromHtml(pageHtml);
  if (htmlEmbed) {
    console.log(`[animotvslash] HTML scrape: ${htmlEmbed}`);
    return htmlEmbed;
  }

  const animeId = extractAnimeId(pageHtml, postId);
  if (animeId) {
    const constructed = `https://tryembed.us.cc/embed/anime/${animeId}/${episodeNum}/sub`;
    console.log(`[animotvslash] Constructed: ${constructed}`);
    return constructed;
  }

  const ajaxActions = ['dynamic_view_ajax', 'dooplay_player', 'get_player', 'load_embed', 'doo_player'];
  for (const action of ajaxActions) {
    const result = await tryAdminAjax(postId, action, episodeNum);
    if (result) return result;
  }

  return null;
}

function scrapeEmbedFromHtml(html) {
  const iframeMatch = html.match(/<iframe[^>]*src=["']([^"']*tryembed[^"']*)["']/i);
  if (iframeMatch) return iframeMatch[1];

  const matches = html.match(/https:\/\/tryembed\.us\.cc\/[^"'\s<>]+/gi);
  if (matches) {
    const embed = matches.find(u => u.includes('/embed/'));
    if (embed) return embed;
  }

  const dataMatch = html.match(/data-embed=["']([^"']+)["']/i);
  if (dataMatch) return dataMatch[1];

  return null;
}

async function tryAdminAjax(postId, action, episodeNum) {
  const formData = new URLSearchParams();
  formData.append('action', action);
  formData.append('post_id', postId);
  formData.append('nume', episodeNum);
  formData.append('type', 'tv');

  try {
    const res = await fetchWithCookies('https://animotvslash.org/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://animotvslash.org',
        'Referer': `https://animotvslash.org/`,
      },
      body: formData.toString(),
    });

    if (!res.ok) return null;

    const text = await res.text();

    if (text.includes('"views"') && !text.includes('iframe') && !text.includes('embed') && !text.includes('tryembed')) {
      console.log(`[animotvslash] action=${action} returned views only`);
      return null;
    }

    console.log(`[animotvslash] action=${action} raw: ${text.substring(0, 300)}`);

    const iframeMatch = text.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    if (iframeMatch) return iframeMatch[1];

    try {
      const json = JSON.parse(text);
      if (json.data) {
        const html = json.data.replace(/\\"/g, '"').replace(/\\\//g, '/');
        const match = html.match(/<iframe[^>]*src=["']([^"']+)["']/i);
        if (match) return match[1];
      }
      if (json.embed_url) return json.embed_url;
      if (json.url) return json.url;
      if (json.iframe) return json.iframe;
    } catch (e) {}

    return null;
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------
// TOKEN TO STREAM URL — With rate limit handling
// ------------------------------------------------------------------

/**
 * Converts a provider token to a signed m3u8 URL
 * Handles 429 rate limits with retry
 */
async function resolveToken(token, embedUrl, retryCount = 0) {
  const cacheKey = `${token}`;
  if (tokenCache[cacheKey]) {
    console.log(`[animotvslash] [token] Cache hit`);
    return tokenCache[cacheKey];
  }

  const signedUrl = `https://tryembed.us.cc/s/${token}.m3u8`;
  console.log(`[animotvslash] [token] Resolving: ${signedUrl.substring(0, 80)}...`);

  try {
    const getRes = await fetchWithCookies(signedUrl, {
      method: 'GET',
      headers: {
        ...EMBED_HEADERS,
        'Referer': embedUrl,
      },
      redirect: 'follow',
    });

    console.log(`[animotvslash] [token] GET status: ${getRes.status}`);

    if (getRes.status === 429 && retryCount < 3) {
      // Rate limited — wait and retry
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[animotvslash] [token] 429, retrying in ${delay}ms...`);
      if (typeof setTimeout === "function") await new Promise(r => setTimeout(r, delay)); /* device: no timers -> skip backoff, retry immediately */
      return resolveToken(token, embedUrl, retryCount + 1);
    }

    if (getRes.ok) {
      const finalUrl = getRes.url;
      console.log(`[animotvslash] [token] Final URL: ${finalUrl.substring(0, 100)}...`);

      // Cache the result
      tokenCache[cacheKey] = finalUrl;

      return finalUrl;
    }

    console.log(`[animotvslash] [token] GET failed: ${getRes.status}`);
    return null;

  } catch (err) {
    console.error(`[animotvslash] [token] Error: ${err.message}`);
    return null;
  }
}

// ------------------------------------------------------------------
// STREAM DATA API
// ------------------------------------------------------------------
async function extractTryEmbed(embedUrl) {
  console.log(`[animotvslash] [tryembed] Extracting: ${embedUrl}`);

  const match = embedUrl.match(/\/embed\/anime\/(\d+)\/(\d+)\/(sub|dub)/);
  if (!match) {
    console.log(`[animotvslash] [tryembed] URL format mismatch`);
    return [];
  }

  const [, animeId, episode, audio] = match;
  console.log(`[animotvslash] [tryembed] animeId=${animeId}, ep=${episode}, audio=${audio}`);

  const apiUrl = `https://tryembed.us.cc/api/stream_data?id=${animeId}&episode=${episode}&audio=${audio}`;
  console.log(`[animotvslash] [tryembed] API: ${apiUrl}`);

  const streamData = await fetchJSONWithCookies(apiUrl, {
    ...EMBED_HEADERS,
    'Referer': embedUrl,
  });

  if (!streamData) {
    console.log(`[animotvslash] [tryembed] API no response`);
    return [];
  }

  console.log(`[animotvslash] [tryembed] API keys: ${Object.keys(streamData).join(', ')}`);

  const providers = streamData.providers || streamData.sources || streamData.streams;

  if (providers && Array.isArray(providers) && providers.length > 0) {
    console.log(`[animotvslash] [tryembed] Found ${providers.length} provider(s)`);

    const results = [];

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const providerName = provider.name || provider.server || provider.id || `Server ${i + 1}`;
      const providerType = provider.type || 'hls';

      console.log(`[animotvslash] [tryembed] Provider ${i}: ${providerName} (type=${providerType})`);

      const qualities = provider.qualities || provider.sources || [{ name: 'Auto', token: provider.token || provider.url }];

      if (!qualities || !Array.isArray(qualities)) {
        console.log(`[animotvslash] [tryembed] Provider ${i} has no qualities`);
        continue;
      }

      for (let j = 0; j < qualities.length; j++) {
        const quality = qualities[j];
        const qualityName = quality.name || quality.label || `Quality ${j + 1}`;
        const token = quality.token || quality.url || quality.file || quality.src;
        const fallbackToken = quality.fallbackToken;

        if (!token) {
          console.log(`[animotvslash] [tryembed] Quality ${j} has no token`);
          continue;
        }

        console.log(`[animotvslash] [tryembed] Quality ${j}: ${qualityName}`);

        // Resolve token to stream URL
        let streamUrl = await resolveToken(token, embedUrl);

        // If primary fails, try fallback
        if (!streamUrl && fallbackToken) {
          console.log(`[animotvslash] [tryembed] Trying fallback token`);
          streamUrl = await resolveToken(fallbackToken, embedUrl);
        }

        if (streamUrl) {
          results.push({
            url: streamUrl,
            name: `${providerName} - ${qualityName}`,
            type: providerType,
          });
        }
      }
    }

    return results;
  }

  // Fallback: single url field
  const signedUrl = streamData.url || streamData.source || streamData.stream || streamData.m3u8;
  if (signedUrl) {
    console.log(`[animotvslash] [tryembed] Single URL: ${signedUrl.substring(0, 80)}...`);

    try {
      const getRes = await fetchWithCookies(signedUrl, {
        method: 'GET',
        headers: {
          ...EMBED_HEADERS,
          'Referer': embedUrl,
        },
        redirect: 'follow',
      });

      if (getRes.ok) {
        return [{ url: getRes.url, name: 'Auto', type: 'hls' }];
      }
      return [];
    } catch (err) {
      console.error(`[animotvslash] [tryembed] redirect error: ${err.message}`);
      return [];
    }
  }

  console.log(`[animotvslash] [tryembed] No stream URL found`);
  return [];
}

// ------------------------------------------------------------------
// URL fallback resolver
// ------------------------------------------------------------------
async function resolvePageWithFallbacks(candidateUrls) {
    for (let i = 0; i < candidateUrls.length; i++) {
        const url = candidateUrls[i];
        console.log(`[animotvslash] Trying URL (${i + 1}/${candidateUrls.length}): ${url}`);
        const result = await fetchHTMLWithCookies(url);
        if (result.html) {
            const hasPostId = result.html.match(/<link rel="shortlink" href="[^"]*\?p=(\d+)"/) ||
                              result.html.match(/"post_id":"(\d+)"/) ||
                              result.html.match(/\/wp-json\/wp\/v2\/posts\/(\d+)/);
            if (hasPostId) {
                console.log(`[animotvslash] Valid page: ${url}`);
                return { html: result.html, finalUrl: result.finalUrl, pageUrl: url };
            }
        }
    }
    return { html: null, finalUrl: null, pageUrl: null };
}

// ------------------------------------------------------------------
// SEARCH FALLBACK (v5.1.0): romanization-mismatch slugs
// ------------------------------------------------------------------
// TMDB "Naruto Shippūden" slugifies to "naruto-shippden" but the site uses
// "naruto-shippuuden" — no static translit map can guess every romanization.
// When the direct slug candidates 404, run the site's WordPress search and
// match rows by title, then take the real episode link off the show page.

function searchRows(html) {
    const rows = [];
    const re = /<a[^>]+href="(https?:\/\/animotvslash\.org\/[^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const href = m[1].replace(/\/$/, '');
        const tm = tag.match(/title="([^"]+)"/i);
        if (!tm) continue;
        if (href.indexOf('/anime/') !== -1 || /-episode-\d+$/.test(href)) {
            rows.push({ href: href + '/', title: tm[1] });
        }
    }
    return rows;
}

/**
 * Finds the episode/watch page through the site's search when slug guesses
 * fail. Returns the same shape as resolvePageWithFallbacks (or nulls).
 */
async function resolvePageBySearch(title, original, episodeNum, seasonNum) {
    const queries = [];
    if (title) queries.push(title);
    if (original && original !== title) queries.push(original);
    const wantKey = titleKey(title || original || '');
    for (const q of queries) {
        const result = await fetchHTMLWithCookies('https://animotvslash.org/?s=' + encodeURIComponent(q));
        if (!result.html) continue;
        const rows = searchRows(result.html);
        // exact (or prefix) title match; prefer the shortest path per title
        let best = null;
        const want = wantKey;
        for (const row of rows) {
            const rowKey = titleKey(row.title);
            if (!rowKey || !want) continue;
            if (rowKey !== want && !rowKey.startsWith(want) && !want.startsWith(rowKey)) continue;
            if (!best || row.href.length < best.href.length) best = row;
        }
        if (!best) continue;
        console.log(`[animotvslash] search match: "${best.title}" -> ${best.href}`);

        if (/-episode-\d+\/$/.test(best.href)) {
            // direct episode/watch row
            const hit = await resolvePageWithFallbacks([best.href]);
            if (hit.html) return hit;
        }
        // show page (/anime/{slug}/): pick the real episode link off it
        const showPage = await fetchHTMLWithCookies(best.href);
        if (!showPage.html) continue;
        // v7.0.0: suffix-tolerant episode scan (same as the direct lane)
        const wantEpS = parseInt(episodeNum, 10) || 1;
        const wantSeasonS = parseInt(seasonNum, 10) || 1;
        const epRe = /href="https?:\/\/animotvslash\.org\/([a-z0-9-]+-episode-(\d+)(?:-(\d+))?)\//gi;
        let em, epPath = '', epAny = '', epPlain = '';
        while ((em = epRe.exec(showPage.html)) !== null) {
            const epN = parseInt(em[2], 10), sufN = em[3] ? parseInt(em[3], 10) : 0;
            if (epN === wantEpS && sufN === wantSeasonS) { epPath = em[1]; break; }
            if (epN === wantEpS && sufN === 0 && !epPlain) epPlain = em[1];
            if (epN === wantEpS && !epAny) epAny = em[1];
            if (!epAny) epAny = em[1]; // movies: any watch page (episode 1)
        }
        if (!epPath) epPath = epPlain || epAny;
        if (epPath) {
            const hit = await resolvePageWithFallbacks(['https://animotvslash.org/' + epPath + '/']);
            if (hit.html) return hit;
        }
    }
    return { html: null, finalUrl: null, pageUrl: null };
}

// ------------------------------------------------------------------
// Main exported function
// ------------------------------------------------------------------

// v5.2.0: normalize '1', '01', 'S01', 'E02' etc. to a plain integer.
function epNum(v) {
    var s = String(v === undefined || v === null ? "" : v).replace(/^[se]/i, "").replace(/[^0-9]/g, "");
    return parseInt(s, 10) || 1;
}

async function runStreams(tmdbId, mediaTypeHint, season, episode) {
    cookieJar = {};

    var seasonNum = epNum(season);
    var episodeNum = epNum(episode);
    console.log(`[animotvslash] === START TMDB:${tmdbId} type=${mediaTypeHint || "auto"} S${seasonNum}E${episodeNum} ===`);

    var forceTv = !!(season && episode);
    var tmdbPromise;
    if (mediaTypeHint === "tv") {
        tmdbPromise = fetchJSONWithCookies(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`).then(function(data) {
            if (!data) throw new Error("TV not found");
            return { type: "tv", title: data.name || "", original: data.original_name || "", year: (data.first_air_date || "").split("-")[0], raw: data };
        }).catch(function() { return { type: "", title: "", original: "", year: "", raw: null }; });
    } else if (mediaTypeHint === "movie") {
        tmdbPromise = fetchJSONWithCookies(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`).then(function(data) {
            if (!data) throw new Error("Movie not found");
            return { type: "movie", title: data.title || "", original: data.original_title || "", year: (data.release_date || "").split("-")[0], raw: data };
        }).catch(function() { return { type: "", title: "", original: "", year: "", raw: null }; });
    } else {
        tmdbPromise = forceTv
            ? fetchJSONWithCookies(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`).then(function(data) {
                if (!data) throw new Error("TV not found");
                return { type: "tv", title: data.name || "", original: data.original_name || "", year: (data.first_air_date || "").split("-")[0], raw: data };
            }).catch(function() { return { type: "", title: "", original: "", year: "", raw: null }; })
            : getTmdbInfoAuto(tmdbId);
    }

    var tmdbData = await tmdbPromise;
    if (!tmdbData.type) {
        console.log(`[animotvslash] Could not detect type for TMDB:${tmdbId}`);
        return [];
    }
    var mediaType = tmdbData.type;
    console.log(`[animotvslash] Type: ${mediaType} | Title: "${tmdbData.title}"`);

    // v5.2.0: several app entry points pass season/episode as null
    // (StreamsScreen.loadSources defaults). seasonNum/episodeNum already
    // default to 1, so instead of returning zero rows we just proceed S1E1
    // (same convention as the app's testScraper).
    if (mediaType === "tv" && (!season || !episode)) {
        console.log("[animotvslash] season/episode not provided by app - defaulting to S1E1");
    }

    try {
        const title = tmdbData.title;
        if (!title) {
            console.log('[animotvslash] No TMDB title');
            return [];
        }

        let baseSlug = slugify(title);
        if (SLUG_OVERRIDES[tmdbId]) {
            baseSlug = SLUG_OVERRIDES[tmdbId];
            console.log(`[animotvslash] Override slug: ${baseSlug}`);
        }

        let candidateUrls = [];
        if (mediaType === 'tv') {
            if (seasonNum > 1) {
                candidateUrls.push(`https://animotvslash.org/${baseSlug}-season-${seasonNum}-episode-${episodeNum}/`);
            }
            candidateUrls.push(`https://animotvslash.org/${baseSlug}-episode-${episodeNum}/`);
            // v7.0.0: the site re-published episodes under "-N" suffixed slugs
            candidateUrls.push(`https://animotvslash.org/${baseSlug}-episode-${episodeNum}-2/`);
        } else {
            candidateUrls.push(`https://animotvslash.org/${baseSlug}/`);
            candidateUrls.push(`https://animotvslash.org/${baseSlug}-episode-1/`);
        }

        const pageResult = await resolvePageWithFallbacks(candidateUrls);
        if (!pageResult.html) {
            // v5.1.0: slug candidates 404 -> search the site by title. Fixes
            // romanization mismatches (Shippūden -> shippuuden etc.) instead
            // of returning zero streams.
            console.log('[animotvslash] All URLs failed, trying site search...');
            const searchResult = await resolvePageBySearch(title, tmdbData.original, episodeNum, seasonNum);
            if (!searchResult.html) {
                console.log('[animotvslash] Search fallback found nothing either');
                // v7.0.0: site unreachable -> ani.zip TMDB->AniList -> MegaPlay ani route
                return megaPlayFallbackStreams('', tmdbData, mediaType, seasonNum, episodeNum);
            }
            return finishStreams(searchResult, tmdbData, mediaType, seasonNum, episodeNum);
        }

        return finishStreams(pageResult, tmdbData, mediaType, seasonNum, episodeNum);

    } catch (err) {
        console.error('[animotvslash] error:', err.message);
        return [];
    }
}

/**
 * Shared tail (v5.1.0): given a resolved episode/watch page, extract player
 * configs and build streams. Split out of getStreams so the search fallback
 * reuses the exact same extraction path.
 */
/* =========================================================================
 * v7.0.0 MEGAPLAY FALLBACK LANE (grafted onto the device-proven v5.4.0 base)
 * The site's own extract lanes died upstream (tryembed signature-locked,
 * plyr/videas players removed from pages, p2pplay + animotvslash.ru SPA
 * Cloudflare-locked even to real browsers). The .ru watch player itself
 * falls back to MegaPlay - this lane ports that fallback:
 *   megaplay.buzz/stream/ani/{anilistId}/{ep}/{sub|dub} -> data-id = fileId
 *   getSourcesNew?id={fileId} -> 2026-09 body: AES-256-CBC "enc" payload
 *   (key = hex 693f4c4d5441783051362c3a7d353055 + 16 zero bytes, IV =
 *   ASCII "W0;27ToaUpl_P%'c", PKCS7) -> {"file":".../master.m3u8"}
 *   master.m3u8 answers 403 WITHOUT ?token= (b64url("unixtime|path") + "."
 *   + b64url(HMAC-SHA256(key, "unixtime|path"))), variants need no token.
 * CryptoJS access prefers the app's own require('crypto-js') (the Nuvio
 * runtime bundles an AES-CBC + HMAC-SHA256 capable polyfill and does NOT
 * define __nvRequire - that shim only exists in the repo audit harness);
 * a global CryptoJS and the harness shim are probed afterwards, so the
 * same code runs under the app, both harnesses and plain Node.
 * MegaPlay's ani route serves SERIES ids only - movies fail soft here
 * exactly like the 4.30.0 rebuild.
 * ========================================================================= */
var MP_BASE = 'https://megaplay.buzz';
var MP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
var MP_API_HEADERS = {
  'User-Agent': MP_UA,
  'Accept': 'application/json',
  'Referer': MP_BASE + '/',
  'X-Requested-With': 'XMLHttpRequest'
};
var MP_ROW_HEADERS = { 'Referer': MP_BASE + '/', 'Origin': MP_BASE };

function mpCJS() {
  try { if (typeof require === 'function') { var c = require('crypto-js'); if (c && c.AES && c.HmacSHA256 && c.lib && c.lib.CipherParams) return c; } } catch (e) {}
  try { if (typeof CryptoJS !== 'undefined' && CryptoJS.AES && CryptoJS.lib && CryptoJS.lib.CipherParams) return CryptoJS; } catch (e2) {}
  try { if (typeof __nvRequire === 'function') { var c2 = __nvRequire('crypto-js'); if (c2 && c2.AES && c2.HmacSHA256 && c2.lib && c2.lib.CipherParams) return c2; } } catch (e3) {}
  return null;
}
var _mpAES = null, _mpHMAC = null, _mpIV = null;
function mpKeys() {
  var C = mpCJS();
  if (!C) return false;
  if (!_mpAES) {
    try {
      _mpAES = C.enc.Hex.parse('693f4c4d5441783051362c3a7d35305500000000000000000000000000000000');
      _mpIV = C.enc.Utf8.parse("W0;27ToaUpl_P%'c");
      _mpHMAC = C.enc.Utf8.parse('MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s');
    } catch (e) { return false; }
  }
  return true;
}
function mpDecryptFile(enc) {
  try {
    var C = mpCJS();
    if (!C || !mpKeys()) return null;
    var ct = C.enc.Base64.parse(String(enc).replace(/-/g, '+').replace(/_/g, '/'));
    var params = C.lib.CipherParams.create({ ciphertext: ct });
    var pt = C.AES.decrypt(params, _mpAES, { iv: _mpIV, mode: C.mode.CBC, padding: C.pad.Pkcs7 });
    var txt = pt.toString(C.enc.Utf8);
    if (!txt) return null;
    var j = JSON.parse(txt);
    return j && j.file ? String(j.file) : null;
  } catch (e) { return null; }
}
function mpTokenForPath(path) {
  var C = mpCJS();
  if (!C || !mpKeys()) return '';
  try {
    var msg = Math.floor(Date.now() / 1000) + '|' + path;
    var b64url = function (wa) {
      return wa.toString(C.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    return b64url(C.enc.Utf8.parse(msg)) + '.' + b64url(C.HmacSHA256(msg, _mpHMAC));
  } catch (e) { return ''; }
}
/** decrypted "file" URL -> { plain, tokenized, path } (CDN gates the master) */
function mpTokenizeMaster(fileUrl) {
  var f = String(fileUrl || '');
  if (/\/$/.test(f)) f += 'master.m3u8';
  var m = f.match(/^https?:\/\/[^/]+\/(?:anime|movie|series|tv)\/(.+?)(?:\/master\.m3u8)?$/);
  var path = m ? m[1] : '';
  if (!path) return { plain: f, tokenized: f, path: '' };
  var tok = mpTokenForPath(path);
  return { plain: f, tokenized: tok ? (f + '?token=' + tok) : f, path: path };
}

/* ---------- ani.zip TMDB -> AniList/MAL mapping (24h cache, v6.0.0 port) ----------
 * NOTE: api.ani.zip/mappings nests the ids under data.mappings
 * ({mappings:{anilist_id, mal_id, ...}}) - verified live 2026-09-13. */
var MP_AZ_TTL = 24 * 60 * 60 * 1000, MP_AZ_MISS_TTL = 60 * 60 * 1000;
var _mpAzCache = {};
function anilistFromTmdb(tmdbId) {
  var key = String(tmdbId);
  var hit = _mpAzCache[key];
  if (hit && Date.now() - hit.ts < (hit.ani || hit.mal ? MP_AZ_TTL : MP_AZ_MISS_TTL)) {
    return Promise.resolve({ ani: hit.ani || null, mal: hit.mal || null });
  }
  return fetchJSONWithCookies('https://api.ani.zip/mappings?themoviedb_id=' + encodeURIComponent(key))
    .then(function (data) {
      var mp = (data && data.mappings) || {};
      var ani = mp.anilist_id != null && parseInt(mp.anilist_id, 10) > 0 ? String(parseInt(mp.anilist_id, 10)) : null;
      var mal = mp.mal_id != null && parseInt(mp.mal_id, 10) > 0 ? String(parseInt(mp.mal_id, 10)) : null;
      _mpAzCache[key] = { ts: Date.now(), ani: ani, mal: mal };
      return { ani: ani, mal: mal };
    }).catch(function () {
      _mpAzCache[key] = { ts: Date.now(), ani: null, mal: null };
      return { ani: null, mal: null };
    });
}

/* ---------- MegaPlay ani/mal route: episode page -> file id -> sources ---------- */
function mpFileIdFor(route, mapId, ep, lang) {
  var url = MP_BASE + '/stream/' + route + '/' + encodeURIComponent(mapId) + '/' + encodeURIComponent(ep) + '/' + lang;
  return fetchWithCookies(url, { headers: { 'User-Agent': MP_UA, 'Accept': 'text/html,*/*', 'Referer': MP_BASE + '/' } })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      if (!html || html.indexOf('Error - MegaPlay') !== -1) return null;
      var m = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
              html.match(/data-id="(\d+)"/) ||
              html.match(/<title>File (\d+) - MegaPlay/);
      return m ? m[1] : null;
    }).catch(function () { return null; });
}

var MP_SRC_TTL = 10 * 60 * 1000;
var _mpSrcCache = {};
function mpSources(fileId) {
  var cacheKey = String(fileId);
  var hit = _mpSrcCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_SRC_TTL) {
    var d0 = hit.data;
    if (d0 && d0.path) {
      try {
        var tk0 = mpTokenForPath(d0.path);
        if (tk0) d0.file = d0.plain + '?token=' + tk0; // signed token refresh
      } catch (e5) {}
    }
    return Promise.resolve(d0);
  }
  var url = MP_BASE + '/stream/getSourcesNew?id=' + encodeURIComponent(fileId);
  return fetchWithCookies(url, { headers: MP_API_HEADERS })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data) return null;
      var tracks = Array.isArray(data.tracks) ? data.tracks : [];
      var file = null;
      if (data.enc) file = mpDecryptFile(data.enc);                    // 2026-09 encrypted body
      if (!file && data.sources && data.sources.file && /^https?:\/\//i.test(String(data.sources.file))) {
        file = String(data.sources.file);                              // legacy plain body
      }
      if (!file) return null;
      var built = mpTokenizeMaster(file);
      var out = { file: built.tokenized, plain: built.plain, path: built.path, tracks: tracks };
      _mpSrcCache[cacheKey] = { ts: Date.now(), data: out };
      return out;
    }).catch(function () { return null; });
}

function mpSubsFromTracks(tracks) {
  return (tracks || []).filter(function (t) {
    return t && t.file && /^https?:/i.test(String(t.file)) &&
      /(english|filipino|tagalog)/i.test(String(t.label || t.language || ''));
  }).slice(0, 6).map(function (t) {
    var l = String(t.label || t.language || 'English');
    var isTl = /filipino|tagalog/i.test(l);
    return { url: String(t.file), language: isTl ? 'tl' : 'en', name: isTl ? 'Tagalog / Filipino' : l };
  });
}

/** tokenized master -> whitelist rows (Auto + 480p/720p/1080p) */
function mpRowsFromMaster(masterUrl, side, subs, meta) {
  var desc = meta.titleLine + '\n' + meta.epLine + '\n✨ MegaPlay ' + side + ' lane\n🔗 AnimeTVSlash';
  return fetchWithCookies(masterUrl, { headers: MP_ROW_HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (t) {
      var out = [];
      if (t && t.indexOf('#EXTM3U') !== -1) {
        var lines = t.split('\n'), variants = [], i, mm;
        for (i = 0; i < lines.length; i++) {
          mm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
          if (mm) {
            var h = parseInt(mm[2], 10), u = '', j;
            for (j = i + 1; j < lines.length; j++) {
              var s = String(lines[j]).trim();
              if (s && s.charAt(0) !== '#') { u = s; break; }
            }
            if (u) variants.push({ h: h, url: u });
          }
        }
        var q = { 480: '480p', 720: '720p', 1080: '1080p' };
        variants.forEach(function (v) {
          var lab = q[v.h];
          if (!lab) return;
          var vu = /^https?:\/\//i.test(v.url) ? v.url : masterUrl.replace(/[^/]*$/, v.url);
          out.push({
            name: 'ANIMOTVSLASH - MegaPlay ' + side + ' | ' + lab,
            title: meta.epLine,
            url: vu, quality: lab, subtitles: subs, headers: MP_ROW_HEADERS, provider: 'animotvslash',
          });
        });
      }
      if (!out.length) {
        out.push({
          name: 'ANIMOTVSLASH - MegaPlay ' + side + ' | Auto',
          title: meta.epLine,
          url: masterUrl, quality: 'Auto', subtitles: subs, headers: MP_ROW_HEADERS, provider: 'animotvslash',
        });
      }
      return out;
    }).catch(function () {
      return [{
        name: 'ANIMOTVSLASH - MegaPlay ' + side + ' | Auto',
        title: meta.epLine,
        url: masterUrl, quality: 'Auto', subtitles: subs, headers: MP_ROW_HEADERS, provider: 'animotvslash',
      }];
    });
}

function megaPlayAniLanes(ids, ep, meta, sink) {
  var routes = [];
  if (ids && ids.ani) routes.push(['ani', ids.ani]);
  if (ids && ids.mal) routes.push(['mal', ids.mal]);
  if (!routes.length) return Promise.resolve(null);
  var langs = ['sub', 'dub'];
  return Promise.all(langs.map(function (lang) {
    var tried = Promise.resolve(null);
    routes.forEach(function (r) {
      tried = tried.then(function (fid) {
        if (fid) return fid;
        return mpFileIdFor(r[0], r[1], ep, lang);
      });
    });
    return tried.then(function (fid) {
      if (!fid) return null;
      return mpSources(fid).then(function (src) {
        if (!src || !src.file) return null;
        var subs = mpSubsFromTracks(src.tracks);
        return mpRowsFromMaster(src.file, lang === 'dub' ? 'Dub' : 'Sub', subs, meta).then(function (rows) {
          rows.forEach(sink);
          return rows.length;
        });
      });
    }).catch(function () { return null; });
  }));
}

/**
 * v7.0.0 shared fallback: build MegaPlay rows when the site's own extract
 * lanes yield nothing. Order of ani-id sources:
 *   1. animotvslash.ru/watch/{anilistId}/{ep} embeds inside the episode page
 *   2. api.ani.zip themoviedb_id -> anilist_id (TMDB shows)
 * Rows pass the v5.4.0 quality whitelist before returning. Series only.
 */
async function megaPlayFallbackStreams(html, tmdbData, mediaType, seasonNum, episodeNum) {
  if (mediaType !== 'tv') return []; // MegaPlay ani/mal routes = series-only
  var idList = [];
  var mm, ru = /animotvslash\.ru\/watch\/(\d+)\/(?:\d+)/gi;
  while ((mm = ru.exec(String(html || ''))) !== null) {
    var aid = parseInt(mm[1], 10);
    if (aid && !idList.some(function (x) { return x.ani === String(aid); })) {
      idList.push({ ani: String(aid), mal: null });
    }
    if (idList.length >= 3) break;
  }
  if (!idList.length && tmdbData && tmdbData.raw && tmdbData.raw.id) {
    var viaZip = await anilistFromTmdb(String(tmdbData.raw.id));
    if (viaZip && (viaZip.ani || viaZip.mal)) idList.push(viaZip);
  }
  if (!idList.length) {
    console.log('[animotvslash] MegaPlay fallback: no anilist/mal id available');
    return [];
  }
  var title0 = (tmdbData && (tmdbData.title || tmdbData.original)) || 'Anime';
  var meta = {
    titleLine: '🎬 ' + title0,
    epLine: 'S' + (seasonNum || 1) + 'E' + (episodeNum || 1),
  };
  var rows = [];
  for (var ii = 0; ii < idList.length && rows.length === 0; ii++) {
    console.log('[animotvslash] MegaPlay fallback: ani ' + (idList[ii].ani || idList[ii].mal) + ' E' + episodeNum);
    await megaPlayAniLanes(idList[ii], episodeNum, meta, function (r) { rows.push(r); });
  }
  var kept = rows.filter(function (r) { return animoQualityAllowed(r.quality); });
  console.log('[animotvslash] MegaPlay fallback: ' + kept.length + ' row(s) after whitelist');
  return kept;
}

async function finishStreams(pageResult, tmdbData, mediaType, seasonNum, episodeNum) {
    const { html, pageUrl } = pageResult;

    const postId = await getPostId(html, slugify(tmdbData.title));
    if (!postId) {
        console.log('[animotvslash] No post_id found - trying MegaPlay fallback before giving up');
        return megaPlayFallbackStreams(html, tmdbData, mediaType, seasonNum, episodeNum);
    }
    console.log(`[animotvslash] post_id: ${postId}`);

    const streams = [];
    const label = mediaType === 'tv' ? `S${seasonNum}E${episodeNum}` : 'Movie';

        // PRIMARY (v5.0.0): self-hosted player configs -> direct headerless HLS
        // (plyr-player/videas and jw-player/rumble verified 200 with zero headers)
        const configs = decodePlayerConfigs(html);
        for (let ci = 0; ci < configs.length; ci++) {
            const cfg = configs[ci];
            const serverTag = ci === 0 ? '' : ` ${ci + 1}`;
            console.log(`[animotvslash] player config ${ci + 1}: ${cfg.url.substring(0, 90)}...`);

            const variants = await parseHlsVariants(cfg.url);
            if (variants.length > 0) {
                // adaptive master first (player auto-picks), then concrete variants best-first
                streams.push({
                    name: `ANIMOTVSLASH${serverTag} - Auto`,
                    title: label,
                    url: cfg.url,
                    quality: 'Auto',
                    provider: 'animotvslash',
                });
                variants.sort(function (a, b) { return variantRank(b.name) - variantRank(a.name); });
                for (let vi = 0; vi < variants.length; vi++) {
                    streams.push({
                        name: `ANIMOTVSLASH${serverTag} - ${variants[vi].name}`,
                        title: label,
                        url: variants[vi].url,
                        quality: variants[vi].name,
                        provider: 'animotvslash',
                    });
                }
            } else {
                streams.push({
                    name: `ANIMOTVSLASH${serverTag} - Auto`,
                    title: label,
                    url: cfg.url,
                    quality: 'Auto',
                    provider: 'animotvslash',
                });
            }
        }

        if (streams.length === 0) {
            // FALLBACK: legacy tryembed flow (older pages; its API is now
            // signature-gated so this only fires if tryembed comes back)
            const embedUrl = await getEmbedUrl(postId, html, episodeNum);
            if (embedUrl) {
                console.log(`[animotvslash] tryembed embed URL: ${embedUrl}`);
                const providerResults = await extractTryEmbed(embedUrl);
                for (let i = 0; i < providerResults.length; i++) {
                    const result = providerResults[i];
                    console.log(`[animotvslash] Stream ${i + 1}: ${result.url.substring(0, 100)}...`);
                    streams.push({
                        name: `ANIMOTVSLASH - ${result.name}`,
                        title: label,
                        url: result.url,
                        quality: 'Auto',
                        headers: EMBED_HEADERS,
                        provider: 'animotvslash',
                    });
                }
            }
        }

        // NOTE (v5.0.0): the old guaranteed "WebView"/"Page" embed rows were
        // removed — embed URLs are unplayable in Nuvio native players and only
        // cluttered the stream list (same cleanup as pinoyhub v5.1.0).

        if (streams.length === 0) {
            // v7.0.0: the site's own extract lanes are dead upstream -> the
            // site's own MegaPlay fallback (same lane the .ru watch player uses).
            const mpRows = await megaPlayFallbackStreams(html, tmdbData, mediaType, seasonNum, episodeNum);
            if (mpRows.length) return mpRows;
        }

        // v5.4.0: quality whitelist - 480p/720p/1080p/Auto only (user request).
        const kept = [];
        for (let si = 0; si < streams.length; si++) {
            if (animoQualityAllowed(streams[si].quality)) kept.push(streams[si]);
        }
        console.log(`[animotvslash] Returning ${kept.length} stream(s) ` +
            `after 480/720/1080p/auto filter (dropped ${streams.length - kept.length})`);
        return kept;
}

/**
 * v5.3.0: parse asian-catalog fallback ids (same contract as asianhub.js /
 * pinoyhub.js). Returns { source, slug, title } or null.
 *   asian:an-<slug>  -> this plugin's DIRECT lane (source 'an')
 *   asian:kh-<id>    -> owned by AsianHub -> skip
 *   asian:<slug>     -> generic legacy row -> treated as an an- lane here
 */
function parseAsianCatalogId(rawId) {
  var s = String(rawId || "").trim();
  try { if (s.indexOf("%") !== -1) s = decodeURIComponent(s); } catch (e0) {}
  var m = s.match(/^asian[:\/](.+)$/i);
  if (!m) return null;
  // v7.0.0: split on BOTH separators so ":1:5" / "/1/5" episode decorations
  // and ".json" suffixes are stripped before the slug shape test
  var tail = m[1].replace(/\.json$/i, "").split(/[\/:]/)[0].trim().toLowerCase();
  if (!tail || !/^[a-z0-9][a-z0-9-]*$/i.test(tail)) return null;
  var pm = tail.match(/^(an|kh)-([a-z0-9][a-z0-9-]*)$/);
  if (pm) {
    if (!pm[2]) return null;
    var stitle = pm[2].replace(/-+/g, " ").replace(/\s+/g, " ").trim();
    if (!stitle) return null;
    return { source: pm[1], slug: pm[2], title: stitle };
  }
  var title = tail.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return null;
  return { source: "", slug: tail, title: title };
}

/**
 * v5.3.0 DIRECT lane for asian:an-<slug> rows: navigate /anime/{slug}/,
 * pick the real episode link, extract. No title search anywhere.
 */
async function catalogDirectStreams(catalogId, seasonNum, episodeNum) {
  const slug = catalogId.slug;
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return [];
  const wantEp = parseInt(episodeNum, 10) || 1;
  console.log(`[animotvslash] catalog direct lane: an-${slug} ep=${wantEp}`);

  // 1) the show page (canonical /anime/ form; root form tolerated)
  const showPage = await fetchHTMLWithCookies(`https://animotvslash.org/anime/${slug}/`)
    .catch(() => ({ html: null }));
  let showHtml = showPage && showPage.html;
  if (!showHtml) {
    const rootPage = await fetchHTMLWithCookies(`https://animotvslash.org/${slug}/`)
      .catch(() => ({ html: null }));
    showHtml = rootPage && rootPage.html;
  }
  if (!showHtml) {
    console.log('[animotvslash] catalog direct lane: show page unreachable');
    return [];
  }

  // 2) the real episode link off the show page (same scan as the search
  //    fallback — episode slugs differ from series slugs on this site)
  // v7.0.0: episode slugs now carry an optional trailing "-N" suffix
  // ("-episode-5-2/" observed live 2026-09-13; the plain form also resolves
  // and both serve the same episode) - capture it, match on episode number.
  const wantSeason = parseInt(seasonNum, 10) || 1;
  const epRe = /href="https?:\/\/animotvslash\.org\/([a-z0-9-]+-episode-(\d+)(?:-(\d+))?)\//gi;
  let em, epPath = '', epAny = '', epPlain = '';
  while ((em = epRe.exec(showHtml)) !== null) {
    const epN = parseInt(em[2], 10), sufN = em[3] ? parseInt(em[3], 10) : 0;
    if (epN === wantEp && sufN === wantSeason) { epPath = em[1]; break; }
    if (epN === wantEp && sufN === 0 && !epPlain) epPlain = em[1];
    if (epN === wantEp && !epAny) epAny = em[1];
    if (!epAny) epAny = em[1]; // movies: any watch page
  }
  if (!epPath) epPath = epPlain || epAny;
  if (!epPath) {
    console.log('[animotvslash] catalog direct lane: no episode link on show page');
    return [];
  }
  const hit = await resolvePageWithFallbacks([`https://animotvslash.org/${epPath}/`]);
  if (!hit.html) {
    console.log('[animotvslash] catalog direct lane: episode page unreachable');
    return [];
  }
  console.log(`[animotvslash] catalog direct lane hit: ${epPath}`);
  const pseudo = { title: catalogId.title, original: catalogId.title, year: "", raw: null };
  return finishStreams(hit, pseudo, 'tv', seasonNum || 1, wantEp);
}

/**
 * v5.2.0 app entry: remaps the 4-arg app signature, normalizes media-type
 * aliases ("series"/"show" -> "tv", NuvioTVSmart passes the type verbatim)
 * and resolves IMDb tt-ids (app without TMDB key) to TMDB ids before the
 * main runStreams flow.
 */
async function getStreams(tmdbId, season, episode) {
    var mediaType = null;
    var mtSlot = String(season === undefined || season === null ? "" : season).toLowerCase();
    if (mtSlot === "movie" || mtSlot === "tv" || mtSlot === "series" || mtSlot === "show" || mtSlot === "tv_show" || mtSlot === "tvshow") {
        mediaType = mtSlot === "movie" ? "movie" : "tv";
        season = episode;
        episode = arguments[3];
    }

    var idStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/^tmdb:/i, "").trim();
    if (!idStr) return [];

    // v5.3.0: asian-catalog fallback rows (asian:an-<slug> / generic
    // asian:<slug>) -> direct lane; asian:kh-<id> -> AsianHub's lane, skip.
    var catalogId = parseAsianCatalogId(idStr);
    if (catalogId) {
      if (catalogId.source === "kh") {
        console.log(`[animotvslash] asian:kh- id -> handled by AsianHub plugin, skipping`);
        return [];
      }
      var catSeason = mediaType === "tv" ? (parseInt(season, 10) || 1) : 1;
      return catalogDirectStreams(catalogId, catSeason, episode);
    }

    if (/^tt\d+/i.test(idStr)) {
        var hit = await fetchJSONWithCookies(`https://api.themoviedb.org/3/find/${idStr}?api_key=${TMDB_API_KEY}&external_source=imdb_id`).then(function(data) {
            if (!data || typeof data !== "object") return null;
            var tv = (data.tv_results || [])[0];
            var mv = (data.movie_results || [])[0];
            if (tv && tv.id) return { tmdbId: String(tv.id), type: "tv" };
            if (mv && mv.id) return { tmdbId: String(mv.id), type: "movie" };
            return null;
        }).catch(function() { return null; });
        if (!hit) {
            console.log(`[animotvslash] IMDb id could not be resolved: ${idStr}`);
            return [];
        }
        console.log(`[animotvslash] IMDb ${idStr} -> TMDB ${hit.tmdbId} (${hit.type})`);
        return runStreams(hit.tmdbId, mediaType || hit.type, season, episode);
    }

    return runStreams(idStr, mediaType, season, episode);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else if (typeof global !== "undefined") {
    global.getStreams = getStreams;
}
