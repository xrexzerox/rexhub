/**
 * Pencuri — Nuvio provider (v1.4.0)
 *
 * Paired with asian-catalog v5.5.0: the addon's Pencuri catalogs (Movies
 * /movies/ + Series /series/ + the Malaysia / Indonesia / Japan / Thailand
 * / Most Viewed / Most Rating / Top IMDb boards) from pencurimovie.baby
 * emit `tmdb:<id>` rows
 * when TMDB matches and `asian:pen-<slug>` fallback rows when it does not.
 * This plugin plays BOTH:
 *
 *   asian:pen-<slug> / asian:<slug>  -> navigate the site's real page
 *     (movie) or its real episode page (series) — zero title searching.
 *   numeric / tmdb:<id> / tt:<imdb>  -> TMDB lookup -> site search
 *     `/?s={title}` -> best title+year match -> same resolution flow.
 *
 * v1.4.0 — ENGLISH SUBTITLES ("all stream now working for pencuri but
 *   please support english subtitle for pencuri.js" — user report after
 *   4.15.0, 2026-09-11):
 *   Every returned stream row now carries a `subtitles` array of ENGLISH
 *   tracks: s.subtitles = [{ url, language: "en", name: "English" }] —
 *   the exact shape NuvioMobile's PluginRuntime maps to PluginSubtitleResult
 *   (url / language / name / headers) and netmirror.js 5.x already emits.
 *   Source: Stremio's official OpenSubtitles-v3 addon (keyless,
 *   opensubtitles-v3.strem.io/subtitles/{movie|series}/{tt[:s:e]}.json)
 *   whose urls (subs5.strem.io .../subencoding-stremio-utf8/...) are plain
 *   UTF-8 SRT downloads — verified live for movies and per-episode.
 *   The IMDb id is resolved per lane, fail-soft, IN PARALLEL with host
 *   extraction so the deadline never moves:
 *     - tt:<imdb>            -> direct.
 *     - numeric / tmdb:<id>  -> TMDB /{kind}/{id}/external_ids.
 *     - asian:pen-<slug>     -> the detail page's og:title "Name (Year)"
 *                               -> TMDB search (year-matched) ->
 *                               external_ids. The page-title lane fires the
 *                               moment resolveBySlug touches a live page
 *                               (title-gate deferred — no timers, device
 *                               safe); if the page dies the gate settles
 *                               with the rows and nothing hangs.
 *   Clean tracks sort before hearing-impaired; 4 tracks max; 30min cache
 *   keyed imdb:movie|imdb:tv:s:e.
 *
 * v1.3.0 FIXES ("only show 1 stream and its not playing example movie -
 *   have 8 server you should get all playable stream link" — user report on
 *   4.14.0 with /mutiny-2026/ as the sample, 2026-09-11):
 *   0. *** THE STREAMTAPE DECOY ***: a Streamtape /e/ page carries TWO
 *      get_video links — the #robotlink DIV TEXT and the one its script
 *      writes via `getElementById('robotlink').innerHTML = ...`. The DIV
 *      token is a DECOY: https://streamtape.com/get_video?...&token=<div>
 *      answers {"status":403/500,"msg":"Access Denied / error on our
 *      side!"} (verified live, exactly the dead link the user pasted).
 *      Only the innerHTML-EXPRESSION token 302s to the real
 *      tapecontent.net radosgw/<id>/<sig>/<Filename>.mp4 (verified live
 *      for both mutiny embeds: 720p + 1080p). v1.2.0 took the div text ->
 *      the ONLY row the app showed was the decoy -> "1 stream and its not
 *      playing". Now an eval-FREE mini evaluator (string literals + `+`
 *      + chained .substring(a[,b]) with real JS semantics) reconstructs
 *      the expression link; the div text is only a fallback.
 *   1. Streamtape rows are labeled from the embed page's own FILENAME
 *      ("Mutiny.2026.720p.WEB-DL…" — carried right on the /e/ page, so no
 *      extra request is needed). The row URL stays the /get_video link: it
 *      re-signs per request at play time, so it never carries a stale or
 *      IP-bound signature (verified live: two requests 20s apart got two
 *      fresh tapecontent signatures). The ranged verify hop now only GATES
 *      div-text fallback rows (decoy-token risk); expression tokens are the
 *      page's own script output and are never dropped — streamtape
 *      soft-blocks chatty egresses with an empty 200 (verified), so a
 *      probing gate would randomly kill good servers.
 *   2. NEW StreamHG lane (hgcloud.to / hglink.to, 2 of the 8 servers on
 *      every Pencuri page — previously skipped as an "unparseable JS
 *      stub"): the stub's obfuscated /main.js only rotates the embed to a
 *      fixed rotating-domain page (https://audinifer.com/e/<id>, decoded
 *      live from the loader). That page's Dean-Edwards packed script
 *      (radix 36) unpacks to a links JSON: hls4/hls3/hls2 — the signed
 *      https://<cdn>/hls2/01/<n>/<id>_n/master.m3u8?t=<sig>&e=129600
 *      verified 206 application/vnd.apple.mpegurl from the datacenter.
 *      The provider unpacks radix-AWARE, picks the best link (.m3u8 >
 *      .txt), probes it, and labels quality from the master playlist's
 *      RESOLUTION= line.
 *   3. unpackPackedScript is now RADIX-AWARE (Dean Edwards p,a,c,k,e with
 *      radix 10..62): hgcloud packs alpha tokens ("y", "1t") that the old
 *      decimal-only regex garbled. Token values are validated against the
 *      radix alphabet (a=10..z=35, A=36..Z=61 — Dean's charset) and only
 *      substituted when the index resolves to a non-empty dictionary
 *      word, so literal words like MDCore/wurl pass through untouched.
 *   4. Placeholder-guard: voe embeds that are dead filler ship a
 *      Big-Buck-Bunny test video in source='...' (verified on mutiny —
 *      both voe tabs). Known test-clip hosts/names are now rejected
 *      instead of probing into a fake row; voeParseReal also learned the
 *      single-quoted source='...' marker for REAL voe embeds.
 *   5. Dood family (playmogo.com / dsvplay.com — 2 of the 8 servers): the
 *      Turnstile gate is UNCONDITIONAL (same challenge page for desktop
 *      UA, mobile UA, cookie attempts — verified live), so a pure HTTP
 *      client can never reach pass_md5. The lane stays and stays
 *      turnstile-aware for other titles/nodes, but on gated pages it
 *      skips in milliseconds. Result for /mutiny-2026/: 4 playable rows
 *      (Streamtape 720p + 1080p, StreamHG x2) instead of 1 broken one.
 *
 * v1.2.0 FIXES ("still doesnt show getstream or stream links not showing,
 *   both movies and tv" — user report on 4.13.0, 2026-09-12):
 *   0. *** THE DEVICE KILLER ***: Nuvio's plugin runtime is QuickJS with
 *      NO setTimeout/clearTimeout (verified in NuvioMobile source: no
 *      timer host bindings, no timer polyfill in JsBindings.kt, no timer
 *      strings in the quickjs-kt AAR). v1.1.0's fetchText called
 *      setTimeout(...) inside the Promise executor -> ReferenceError on
 *      the device -> every fetchText threw -> EVERY lane died -> 0 rows
 *      for BOTH movies and tv. Node/datacenter tests never caught it
 *      because Node HAS timers. Every other working provider guards this
 *      (pinoyhub hasTimers(), miruro hasTimers(), zoechip/vidzee/...).
 *      fetchText now uses the repo-standard guarded pattern: with timers
 *      -> Promise.race timeout; without -> bare fetch (the native fetch
 *      bridge and the app's 60s plugin budget bound the wait).
 *   1. Dood family (dsvplay.com is the FIRST embed on most pages) now
 *      runs the full pinoyhub-proven flow instead of requiring the
 *      pass_md5 response to carry a query: embed page -> turnstile gate
 *      check -> /pass_md5/{token}/{file} (Referer + X-Requested-With) ->
 *      direct URL = base + randomToken(10) + "?token=<token>&expiry=<ms>"
 *      plus the /d/{id} download-page fallback (dref_url cookie).
 *   2. TV-safe rows: every CDN URL is probed HEADERLESS (ranged GET, no
 *      Referer); headers are attached ONLY when the CDN demands them
 *      (verified live: mxcontent.net answers 403 text/html without
 *      Referer, 206 video/mp4 with it). Nuvio parses stream.headers and
 *      ExoPlayer sends them natively on mobile.
 *   3. Stream rows now carry behaviorHints.bingeGroup (pinoyhub shape);
 *      the unknown noProbe field is gone.
 *
 * v1.1.0 FIXES ("pencuri.js dont show streamable", user report 2026-09-12):
 *   1. Nuvio passes the TAPPED EPISODE id for series — "tmdb:<id>:<s>:<e>"
 *      (MetaDetailsScreen.buildPlaybackVideoId -> content.id + ":" + s + ":"
 *      + e) — and the old /^(?:tmdb:)?(\d+)$/ regex rejected it in 0ms.
 *      Same bug class miruro 2.7.0 fixed for mal: ids. The TMDB branch now
 *      tolerates trailing :s:e / :e decorations and prefers the explicit
 *      season/episode args (Nuvio 4-arg contract), falling back to the id
 *      suffix digits only when the args are missing.
 *   2. Series rows on the live site carry a /series/ prefix in their hrefs
 *      (/series/{slug}/ — listing AND /?s= search). parseListingItems
 *      captured "series" as the slug and the skip-list dropped the row,
 *      so the search lane never matched any series -> 0 streams. Now the
 *      prefix is captured, the slug is the last segment, and the row is
 *      typed series from the href.
 *   3. resolveBySlug tries the /series/{slug}/ shape first for series taps
 *      (the old /{slug}/ 301 still works but costs a round-trip and dies
 *      if the site drops the redirect).
 *   4. asian:pen- ids with :s:e suffixes (episode ids from the addon's new
 *      detail-page metas) resolve the episode from the suffix when the app
 *      passes no season/episode args.
 *
 * Site recon (2026-09-11/12, all live):
 *   - WordPress "MovieMo" theme; listing rows are
 *     <div data-movie-id class="ml-item"> -> a.ml-mask[oldtitle="T (Year)"].
 *     Series rows carry an mli-eps "Eps N" badge (the addon types rows from
 *     it; here the PAGE decides: /episode/ links present = series).
 *   - Series pages link episodes as /episode/{base}-season-{S}-episode-{E}
 *     (base = series slug minus the trailing year, verified on
 *     boboiboy-galaxy-baraju-2025 -> boboiboy-galaxy-baraju-season-1-episode-N).
 *   - Detail/episode pages embed a tab ring of servers, one iframe per tab:
 *     dsvplay.com (DoodStream family, redirects to playmogo.com),
 *     hgcloud.to / hglink.to (JS-loader stub), mixdrop.top, voe.sx
 *     (JS-redirects to rotating domains), streamtape.com, listeamed.net,
 *     bigwarp.pro.
 *
 * Extraction lanes (verified from the datacenter where possible):
 *   1. MIXDROP   — the embed page carries a Dean Edwards packed script whose
 *                  unpacked MDCore.wurl is a direct
 *                  https://a-deliveryNN.mxcontent.net/v2/{id}.mp4?... link.
 *                  VERIFIED end-to-end here: HTTP 206, content-type
 *                  video/mp4, ISO-BMFF bytes. PRIMARY lane.
 *   2. STREAMTAPE — the embed page's #robotlink div yields the
 *                  /get_video?...&token=... path (verified token issued;
 *                  the final redirect resolves on residential egresses —
 *                  datacenter egresses get a 500 at that last hop, the row
 *                  is kept anyway: fail-open, device is the judge).
 *   3. DOOD FAMILY (dsvplay.com + friends) — the classic /pass_md5/ flow is
 *                  attempted; pages gated behind a Cloudflare Turnstile
 *                  (challenges.cloudflare.com / .captcha-player markers) are
 *                  skipped immediately so a dead lane never burns the call.
 *   4. VOE       — follows the embed's own JS redirect to its rotating
 *                  domain and searches for direct sources; best-effort.
 *   5. UNKNOWN HOSTS — a cheap page probe for inline file/m3u8 URLs.
 *   hgcloud/hglink serve a JS-only loader stub — skipped (nothing to parse).
 *
 * All lanes are fail-soft: one dead host can never zero the provider, rows
 * are deduped by URL, and every embed the page offers is attempted in
 * parallel. Hermes-safe: no unescape/escape/btoa/atob anywhere.
 *
 * getStreams(<videoId>, <"movie"|"tv"|"series"|"show">, <season?>, <episode?>)
 *   (the mediaType slot is auto-detected; legacy 3-arg calls are tolerated)
 */

var PENCURI_BASE = 'https://ww44.pencurimovie.baby';
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var EMBED_TIMEOUT_MS = 8000;
var PAGE_TIMEOUT_MS = 10000;
// v1.4.0: English subtitles — Stremio's official keyless OpenSubtitles-v3 addon
var OS_V3_BASE = 'https://opensubtitles-v3.strem.io';
var SUBS_TIMEOUT_MS = 7000;
var SUBS_CACHE_TTL = 30 * 60 * 1000;
var _subsCache = {};

function hasTimers() {
  return typeof setTimeout === 'function' && typeof clearTimeout === 'function';
}

var ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'", '#8216': "'", '#8217': "'", '#8220': '"', '#8221': '"' };

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { var c = parseInt(h, 16); return isFinite(c) && c > 0 && c < 65536 ? String.fromCharCode(c) : m; })
    .replace(/&#(\d+);/g, function (m, d) { var c = parseInt(d, 10); return isFinite(c) && c > 0 && c < 65536 ? String.fromCharCode(c) : m; })
    .replace(/&([a-zA-Z#0-9]+);/g, function (m, name) { return ENTITY_MAP[name] !== undefined ? ENTITY_MAP[name] : m; });
}

function stripTags(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); }
function collapseWs(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function attr(tag, name) {
  var m = String(tag || '').match(new RegExp(name + '="([^"]*)"', 'i'));
  if (!m) m = String(tag || '').match(new RegExp(name + "='([^']*)'", 'i'));
  return m ? m[1] : '';
}

function fetchRaw(url, refererOrHeaders, timeoutMs, wantMeta) {
  // v1.2.0: GUARDED timeout race — the device runtime has no timers, so
  // when hasTimers() is false we call fetch bare (the native fetch bridge
  // owns the wait; the app's 60s plugin budget is the hard cap). Calling
  // setTimeout unconditionally was the 4.13.0 zero-rows device bug.
  var headers = { 'User-Agent': UA, 'Accept': 'text/html,*/*' };
  if (refererOrHeaders) {
    if (typeof refererOrHeaders === 'string') {
      headers['Referer'] = refererOrHeaders;
    } else {
      for (var hk in refererOrHeaders) headers[hk] = refererOrHeaders[hk];
    }
  }
  var go = function () {
    return fetch(url, { headers: headers, redirect: 'follow' }).then(function (res) {
      if (!res || !res.ok) return null;
      return res.text().then(function (body) {
        return wantMeta ? { text: body, url: String(res.url || url) } : body;
      });
    }).catch(function () { return null; });
  };
  if (!hasTimers()) {
    try { return go(); } catch (e) { return Promise.resolve(null); }
  }
  return new Promise(function (resolve) {
    var done = false;
    var settle = function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    var timer = setTimeout(function () { settle(null); }, timeoutMs || PAGE_TIMEOUT_MS);
    go().then(function (v) { settle(v); }, function () { settle(null); });
  });
}

function fetchText(url, referer, timeoutMs) {
  return fetchRaw(url, referer, timeoutMs, false);
}

// redirect-aware variant for lanes that need the FINAL url (dood host
// rotation: dsvplay.com 301s to playmogo.com etc.)
function fetchTextFollow(url, referer, timeoutMs) {
  return fetchRaw(url, referer, timeoutMs, true);
}

// v1.3.0: ranged follow probe that reports WHAT happened — { ok, status,
// url, ct } — so lanes can tell a verified stream (ok), a hard upstream
// rejection (status >= 400, or 2xx text/html challenge/soft-404 -> drop the
// row) from network purgatory (status 0 -> keep fail-open). Range: 0-255
// keeps the body tiny even when a host ignores the redirect hop.
function probeRange(url) {
  var dead = function () { return { ok: false, status: 0, url: String(url), ct: '' }; };
  var go = function () {
    return fetch(url, { headers: { 'User-Agent': UA, 'Range': 'bytes=0-255' }, redirect: 'follow' })
      .then(function (res) {
        if (!res) return dead();
        var status = res.status || 0;
        var ct = '';
        try { ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || ''); } catch (e) { ct = ''; }
        var finalUrl = String(url);
        try { if (res.url) finalUrl = String(res.url); } catch (e) {}
        var ok = status >= 200 && status < 300 && !/text\/html/i.test(ct);
        var out = { ok: ok, status: status, url: finalUrl, ct: ct };
        return res.text().then(function () { return out; }, function () { return out; });
      }).catch(dead);
  };
  if (!hasTimers()) {
    try { return go(); } catch (e) { return Promise.resolve(dead()); }
  }
  return new Promise(function (resolve) {
    var settled = false;
    var settle = function (v) { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    var timer = setTimeout(function () { settle(dead()); }, 9000);
    go().then(settle, function () { settle(dead()); });
  });
}

// v1.2.0: headerless playability probe (pinoyhub pattern) — ranged GET
// with NO Referer; a text/html answer means the CDN demands headers.
function probeHeaderless(url) {
  return probeRange(url).then(function (r) { return !!r && r.ok; });
}

function randomToken(len) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var i = 0; i < (len || 8); i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// ---------------------------------------------------------------------------
// tolerant catalog-id parsing (same contract as pinoyhub/asianhub/animotvslash
// + miruro 2.7.0: Nuvio decorates ids — urlencoding, "/" separators, .json,
// episode-id suffixes). "asian:pen-<slug>" is OWNED here; foreign sources are
// skipped fast.
function parsePencuriCatalogId(rawId) {
  var s = String(rawId == null ? '' : rawId).trim();
  if (!s) return null;
  if (s.indexOf('%') >= 0) {
    try { var dec = decodeURIComponent(s); if (dec) s = dec; } catch (e) {}
  }
  s = String(s).trim();
  var h = s.indexOf('#'); if (h >= 0) s = s.slice(0, h);
  var q = s.indexOf('?'); if (q >= 0) s = s.slice(0, q);
  s = s.replace(/\.json([^.].*)?$/i, '').replace(/\.json$/i, '').trim();
  if (!s) return null;
  var m = s.match(/^asian[:\/](.+)$/i);
  if (!m) return null;
  // v1.1.0: tokens AFTER the slug are the tapped-episode decoration
  // ("pen-<slug>:1:3", "pen-<slug>/1/3") — captured as a season/episode
  // fallback for callers that receive no explicit s/e args. Only a pure
  // digit pair counts (never "slug/2026" -> E2026).
  var toks = m[1].split(/[:\/]/);
  var tail = toks[0].trim().toLowerCase();
  var decS = /^\d+$/.test(toks[1] || '') && /^\d+$/.test(toks[2] || '') ? parseInt(toks[1], 10) : 0;
  var decE = decS > 0 ? parseInt(toks[2], 10) : 0;
  if (!tail || !/^[a-z0-9][a-z0-9-]*$/i.test(tail)) return null;
  var pm = tail.match(/^(pen)-([a-z0-9][a-z0-9-]*)$/);
  if (pm) {
    if (!pm[2]) return null;
    return {
      source: pm[1], slug: pm[2],
      season: decS,
      episode: decE
    };
  }
  // foreign source-scoped rows (ks/va/pmh/kh/an-...) -> not ours
  if (/^(ks|va|pmh|kh|an)-/.test(tail)) return { source: 'foreign', slug: '' };
  return {
    source: '', slug: tail, // legacy generic asian:<slug>
    season: decS,
    episode: decE
  };
}

// ---------------------------------------------------------------------------
// site page resolution

function slugBase(slug) {
  // "boboiboy-galaxy-baraju-2025" -> "boboiboy-galaxy-baraju" (episode slugs
  // drop the year; verified live). Non-year slugs pass through.
  var m = String(slug || '').match(/^(.*?)-\d{4}$/);
  return m ? m[1] : String(slug || '');
}

function collectEpisodeLinks(html) {
  var out = [], seen = {}, re = /href="(?:https?:\/\/[^"]*)?(\/episode\/[a-z0-9-]+)\/?"/gi, m;
  while ((m = re.exec(html)) !== null) {
    var ep = m[1].replace(/^\/episode\//, '');
    if (!seen[ep]) { seen[ep] = 1; out.push(ep); }
  }
  return out;
}

function parseEpisodeSlug(epSlug) {
  var m = String(epSlug).match(/^(.*)-season-(\d+)-episode-(\d+)$/i);
  if (m) return { season: parseInt(m[2], 10) || 1, episode: parseInt(m[3], 10) || 1, base: m[1] };
  m = String(epSlug).match(/^(.*)-episode-(\d+)$/i);
  if (m) return { season: 1, episode: parseInt(m[2], 10) || 1, base: m[1] };
  return null;
}

function pickEpisodeLink(epLinks, season, episode) {
  var wantEp = parseInt(episode, 10) || 1;
  var wantSe = parseInt(season, 10) || 1;
  var exact = null, anyEp = null, first = null;
  for (var i = 0; i < epLinks.length; i++) {
    var p = parseEpisodeSlug(epLinks[i]);
    if (!p) continue;
    if (!first) first = epLinks[i];
    if (p.episode === wantEp) {
      if (!anyEp) anyEp = epLinks[i];
      if (p.season === wantSe) { exact = epLinks[i]; break; }
    }
  }
  return exact || anyEp || first;
}

// every /e/{id} embed iframe on a detail/episode page
function collectEmbeds(html) {
  var out = [], seen = {}, re = /(?:data-src|src)="(https?:\/\/[^"']+\/e\/[a-z0-9]+)"/gi, m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1].replace(/^http:\/\//i, 'https://');
    if (!seen[url]) { seen[url] = 1; out.push(url); }
  }
  return out;
}

function isSeriesPage(html) {
  return /\/episode\/[a-z0-9-]+-season-\d+-episode-\d+/i.test(html) ||
    /\/episode\/[a-z0-9-]+-episode-\d+/i.test(html);
}

// ---------------------------------------------------------------------------
// HOST LANES — each returns Promise<row|null> and never rejects.

function makeRow(url, hostLabel, quality, headers) {
  var q = String(quality || '');
  var name = 'Pencuri | ' + hostLabel + (q ? ' | ' + q : '');
  // v1.2.0: pinoyhub-style row — behaviorHints carried, the unknown
  // noProbe field dropped; headers attached ONLY when the CDN needs them.
  var row = { name: name, title: name, url: url, quality: q, behaviorHints: { bingeGroup: 'pencuri-direct' } };
  if (headers) row.headers = headers;
  return row;
}

function qualityFromText(s) {
  var m = String(s || '').match(/(\d{3,4})\s*p/i);
  if (!m) return '';
  var n = parseInt(m[1], 10);
  if (n >= 2160) return '4K';
  if (n >= 1440) return '1440p';
  if (n >= 1000) return '1080p';
  if (n >= 640) return '720p';
  if (n >= 400) return '480p';
  return '';
}

// --- lane 1: mixdrop (verified datacenter-playable direct mp4) --------------
function unpackPackedScript(html) {
  var m = String(html || '').match(/eval\(function\(p,a,c,k,e,[a-z]?\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
  if (!m) return '';
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  var radix = parseInt(m[2], 10) || 10;
  var k = m[4].split('|');
  // v1.3.0: radix-aware substitution. Dean Edwards packs index tokens in
  // base-radix (hgcloud radix=36 -> alpha tokens like "y"/"1t"; the old
  // decimal-only regex garbled those pages). Token chars validated against
  // the radix alphabet (0-9, a=10..z=35, A=36..Z=61 — Dean's charset); a
  // token only substitutes when its index hits a NON-EMPTY dictionary slot,
  // so literal words (MDCore, wurl, ...) pass through untouched.
  return p.replace(/\b[0-9a-zA-Z]+\b/g, function (tok) {
    var v = 0;
    for (var i = 0; i < tok.length; i++) {
      var ch = tok.charAt(i), d;
      if (ch >= '0' && ch <= '9') d = ch.charCodeAt(0) - 48;
      else if (ch >= 'a' && ch <= 'z') d = ch.charCodeAt(0) - 87;
      else if (ch >= 'A' && ch <= 'Z') d = ch.charCodeAt(0) - 29;
      else return tok;
      if (d >= radix) return tok;
      v = v * radix + d;
    }
    if (!isFinite(v) || v < 0 || v >= k.length || !k[v]) return tok;
    return k[v];
  });
}

function mixdropExtract(embedUrl) {
  var hostLabel = 'MixDrop';
  return fetchText(embedUrl, PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (html) {
    if (!html) return null;
    var unpacked = unpackPackedScript(html);
    if (!unpacked) return null;
    var wurl = unpacked.match(/MDCore\.wurl\s*=\s*"([^"]+)"/);
    if (!wurl || !wurl[1]) return null;
    var path = wurl[1].replace(/^\/\//, '');
    var url = /^https?:\/\//i.test(path) ? path : 'https://' + path;
    var q = qualityFromText(unpacked);
    // v1.2.0: mxcontent.net 403s text/html without Referer and 206s with it
    // (verified live) — probe headerless, attach headers only on demand.
    return probeHeaderless(url).then(function (ok) {
      return makeRow(url, hostLabel, q, ok ? '' : { Referer: 'https://mixdrop.top/', 'User-Agent': UA });
    });
  }).catch(function () { return null; });
}

// --- lane 2: streamtape (v1.3.0: the DIV token is a DECOY — only the
// innerHTML-expression token 302s to the real tapecontent.net CDN) -----
// eval-FREE evaluator for Streamtape's innerHTML expression, which is built
// entirely from string literals, `+` concatenation and chained
// .substring(a) / .substring(a,b) calls with real JS semantics
// (verified live: "'//stream'+ ('xcdtape.com/get_video?...&token=X').substring(2).substring(1)"
// — the leading decoy chars are what the substrings strip). Anything else
// in the expression fails soft to ''.
function stSubstr(str, a, b) {
  var len = str.length;
  if (!isFinite(a)) a = 0;
  if (a < 0) a = 0;
  if (a > len) a = len;
  if (b === undefined || b === null) return str.slice(a);
  if (!isFinite(b)) b = 0;
  if (b < 0) b = 0;
  if (b > len) b = len;
  if (a > b) { var t = a; a = b; b = t; }
  return str.slice(a, b);
}

function stEvalExpr(src) {
  var s = String(src || ''), out = '', i = 0, n = s.length;
  while (i < n) {
    var ch = s.charAt(i);
    if (ch === ' ' || ch === '+' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
    if (ch === "'" || ch === '"') {
      var q = ch; i++; var lit = '';
      while (i < n && s.charAt(i) !== q) {
        if (s.charAt(i) === '\\') { i++; lit += s.charAt(i); }
        else lit += s.charAt(i);
        i++;
      }
      if (i >= n) return ''; // unterminated literal -> fail
      i++;
      out += lit;
      continue;
    }
    if (ch === '(') {
      var depth = 0, j = i;
      for (; j < n; j++) {
        var c2 = s.charAt(j);
        if (c2 === '(') depth++;
        else if (c2 === ')') { depth--; if (!depth) break; }
      }
      if (j >= n) return ''; // unbalanced -> fail
      var inner = s.slice(i + 1, j);
      var im = inner.match(/^\s*(['"])([\s\S]*)\1\s*$/);
      if (!im) return ''; // only simple string groups are supported
      var cur = im[2];
      i = j + 1;
      for (;;) {
        var cm = s.slice(i).match(/^\.substring\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/);
        if (!cm) break;
        cur = stSubstr(cur, parseInt(cm[1], 10), cm[2] !== undefined ? parseInt(cm[2], 10) : undefined);
        i += cm[0].length;
      }
      out += cur;
      continue;
    }
    return ''; // unknown token -> fail soft
  }
  return out;
}

function stAbsPath(path) {
  if (path.indexOf('//') === 0) return 'https:' + path;
  if (/^https?:\/\//i.test(path)) return path;
  return 'https://' + path.replace(/^\//, '');
}

function streamtapeExtract(embedUrl) {
  return fetchText(embedUrl, PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (html) {
    if (!html) return null;
    // removed videos: drop at the page level (the /e/ page itself says so)
    if (/video you are looking for|file (was|has been) (removed|deleted)|class="not_found"/i.test(html)) return null;
    // v1.3.0: the embed page carries the real FILENAME (title + body) —
    // "Mutiny.2026.720p.WEB-DL….mkv.mp4" — so quality needs no extra request
    var q = '';
    var fn = html.match(/([A-Za-z0-9._-]+\.(?:mkv|mp4|avi|webm))/i);
    if (fn) q = qualityFromText(fn[1]);
    if (!q) q = qualityFromText(html);
    var divm = html.match(/id="robotlink"[^>]*>([^<]*)/i);
    // accept both quote styles around the id (live pages use single quotes)
    var expr = html.match(/getElementById\(["']robotlink["']\)\.innerHTML\s*=\s*([^;]+);/i);
    var path = '', trusted = false;
    if (expr) {
      var ev = stEvalExpr(expr[1]);
      if (ev && ev.indexOf('get_video') >= 0 && ev.indexOf('token=') >= 0) { path = ev; trusted = true; }
    }
    if (!path && divm) {
      var dv = String(divm[1] || '').trim();
      if (dv.indexOf('get_video') >= 0 && dv.indexOf('token=') >= 0) path = dv; // decoy risk!
    }
    if (!path && divm && expr) {
      var joined = String(divm[1] || '').trim() + stEvalExpr(expr[1]);
      if (joined.indexOf('get_video') >= 0 && joined.indexOf('token=') >= 0) { path = joined; trusted = true; }
    }
    if (!path || path.indexOf('get_video') < 0) return null;
    var abs = stAbsPath(path);
    // Expression tokens ARE the page's own player link — ship them directly.
    // The token re-signs per request at play time (fresh for the player IP),
    // so no probe is needed: probing only burns requests streamtape
    // rate-limits aggressively (empty-200 soft block, verified live).
    if (trusted) return makeRow(abs, 'Streamtape', q, '');
    // div-text fallback = decoy-token risk (403/500 verified): gate on the
    // ranged verify hop — only a live 302->CDN answer ships the row.
    return probeRange(abs).then(function (r) {
      if (r && r.ok) return makeRow(abs, 'Streamtape', q || qualityFromText(r.url), '');
      return null; // decoy fallback failed verification -> dead
    });
  }).catch(function () { return null; });
}

// --- lane 3: dood family (dsvplay/playmogo/...) — the pinoyhub-proven
// flow. v1.2.0 no longer requires the /pass_md5/ response to carry a
// query: the token from the path + a random tail + expiry IS the
// authorization on most Dood nodes (verified pattern from pinoyhub.js,
// device-proven since 5.5.0). Turnstile-gated pages stay skipped.
var DOOD_HOST_RE = /(^|\.)(dsvplay\.com|dsvplayz?\.com|playmogo\.com|dood\.[a-z.]+|doodstream\.com|ds2play\.com|d000d\.com|d000g\.com|dsvtbs\.com)$/i;

function doodIsGated(html) {
  // Cloudflare Turnstile interstitial: a pure HTTP client never passes.
  return /op=validate|turnstile\.render|challenges\.cloudflare\.com\/turnstile|captcha-player|g-recaptcha/i.test(html);
}

function doodIsDead(html) {
  return /video you are looking for is not found|class="not_found"/i.test(html);
}

function doodFindMd5Path(html) {
  var m = String(html || '').match(/['"]\/(pass_md5\/[a-z0-9]+(?:\/[a-z0-9]+)?)['"]/i);
  if (!m) {
    var unpacked = unpackPackedScript(html);
    if (unpacked) m = unpacked.match(/['"]\/(pass_md5\/[a-z0-9]+(?:\/[a-z0-9]+)?)['"]/i);
  }
  if (m) return m[1];
  m = String(html || '').match(/\/pass_md5\/([a-z0-9]+)/i);
  return m ? 'pass_md5/' + m[1] : null;
}

function doodFromMd5Path(host, md5Path, refererUrl, q, hostLabel) {
  var passUrl = 'https://' + host + '/' + md5Path;
  return fetchText(passUrl, { Referer: refererUrl, 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA }, EMBED_TIMEOUT_MS).then(function (body) {
    var base = String(body || '').trim();
    if (base.indexOf('http') !== 0 || base.length > 300) return null;
    var token = md5Path.split('/')[1] || '';
    var expiry = Date.now() + 2 * 60 * 60 * 1000;
    var directUrl = base + randomToken(10) + '?token=' + token + '&expiry=' + expiry;
    return probeHeaderless(directUrl).then(function (ok) {
      return makeRow(directUrl, hostLabel, q, ok ? '' : { Referer: 'https://' + host + '/', 'User-Agent': UA });
    });
  }).catch(function () { return null; });
}

function doodExtract(embedUrl) {
  var idm = String(embedUrl).match(/\/e\/([a-z0-9]+)/i);
  var embedId = idm ? idm[1] : '';
  return fetchTextFollow(embedUrl, PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (page) {
    if (!page || !page.text) return null;
    var html = page.text;
    var fm = String(page.url || embedUrl).match(/^https?:\/\/([^\/]+)/i);
    var host = fm ? fm[1].replace(/^www\./, '') : (String(embedUrl).match(/^https?:\/\/([^\/]+)/i) || ['', ''])[1];
    var hostLabel = 'Dood (' + host + ')';
    if (doodIsGated(html)) return null;
    if (doodIsDead(html)) return null;
    var title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    var q = qualityFromText(title ? title[1] : '');
    var md5Path = doodFindMd5Path(html);
    if (md5Path) return doodFromMd5Path(host, md5Path, 'https://' + host + '/e/' + (embedId || 'x'), q, hostLabel);
    // legacy /d/{id} download-page fallback (dref_url cookie set client-side)
    if (!embedId) return null;
    var embedAbs = 'https://' + host + '/e/' + embedId;
    return fetchTextFollow('https://' + host + '/d/' + embedId, { Referer: embedAbs, Cookie: 'dref_url=' + encodeURIComponent(embedAbs), 'User-Agent': UA }, EMBED_TIMEOUT_MS).then(function (dl) {
      if (!dl || !dl.text || doodIsGated(dl.text)) return null;
      var fm2 = String(dl.url || embedUrl).match(/^https?:\/\/([^\/]+)/i);
      var dlHost = fm2 ? fm2[1].replace(/^www\./, '') : host;
      var md5Path2 = doodFindMd5Path(dl.text);
      if (!md5Path2) return null;
      return doodFromMd5Path(dlHost, md5Path2, 'https://' + dlHost + '/d/' + embedId, q, 'Dood (' + dlHost + ')');
    });
  }).catch(function () { return null; });
}

// --- lane 3b: StreamHG / hgcloud (v1.3.0) ---------------------------------
// hgcloud.to|hglink.to /e/<id> serves a 452-byte "Loading..." stub whose
// obfuscated /main.js only rotates the embed onto a fixed rotating-domain
// page (decoded live: https://audinifer.com/e/<id>). That page's
// Dean-Edwards packed script (radix 36) unpacks to a links JSON —
// hls4/hls3/hls2 — whose signed master.m3u8 (?t=<sig>&e=129600, ASN-bound)
// verified 206 application/vnd.apple.mpegurl from the datacenter.
var HG_ROTATE_HOSTS = ['audinifer.com'];

function qualityFromHeight(h) {
  var n = parseInt(h, 10);
  if (!isFinite(n) || n <= 0) return '';
  if (n >= 2100) return '4K';
  if (n >= 1400) return '1440p';
  if (n >= 1000) return '1080p';
  if (n >= 640) return '720p';
  if (n >= 400) return '480p';
  return '';
}

function hgParsePlayerPage(html) {
  var unpacked = unpackPackedScript(html);
  if (!unpacked) return null;
  var cands = [], m, re = /["']hls(\d)["']\s*:\s*["']([^"']+)["']/g;
  while ((m = re.exec(unpacked)) !== null) {
    var url = m[2];
    if (!/^https?:\/\//i.test(url) && url.charAt(0) !== '/') continue;
    if (isPlaceholderUrl(url)) continue;
    cands.push({ level: parseInt(m[1], 10) || 0, url: url });
  }
  cands.sort(function (a, b) { return b.level - a.level; }); // hls4 first
  var best = null;
  for (var i = 0; i < cands.length; i++) {
    if (!best && /\.m3u8(?:[?#]|$)/i.test(cands[i].url)) best = cands[i].url;
  }
  if (!best) {
    for (var j = 0; j < cands.length; j++) {
      if (!best && /\.txt(?:[?#]|$)/i.test(cands[j].url)) best = cands[j].url; // HLS disguised as .txt
    }
  }
  if (!best && cands.length) best = cands[0].url;
  if (!best) return null;
  if (best.charAt(0) === '/') best = 'https://' + HG_ROTATE_HOSTS[0] + best;
  // The signed playlist may be ASN-bound: a datacenter probe can be rejected
  // while the device (which fetched the player page and holds its own
  // signature) plays fine — the site's own player uses exactly this URL. So
  // the probe only labels; it never drops (fail-open).
  return probeRange(best).then(function (r) {
    var label = /\.m3u8/i.test(best) ? 'm3u8' : '';
    if (!r || !r.ok) return makeRow(best, 'StreamHG', label, ''); // fail-open
    // signed master playlist is tiny — read it for a RESOLUTION label
    return fetchText(best, 'https://' + HG_ROTATE_HOSTS[0] + '/', EMBED_TIMEOUT_MS).then(function (body) {
      var q = '';
      if (body) {
        var hm = null, rem = /RESOLUTION=\d+x(\d+)/gi;
        while ((hm = rem.exec(String(body))) !== null) {
          if (!q) q = qualityFromHeight(hm[1]);
        }
      }
      return makeRow(best, 'StreamHG', q || label, '');
    });
  });
}

function hgTry(urls, idx) {
  if (idx >= urls.length) return Promise.resolve(null);
  return fetchText(urls[idx], 'https://hgcloud.to/', EMBED_TIMEOUT_MS).then(function (html) {
    if (!html || String(html).length < 2000 || /<title>\s*Loading/i.test(html)) return hgTry(urls, idx + 1);
    return Promise.resolve(hgParsePlayerPage(html)).then(function (row) {
      return row || hgTry(urls, idx + 1);
    });
  }).catch(function () { return hgTry(urls, idx + 1); });
}

function hgcloudExtract(embedUrl) {
  var idm = String(embedUrl).match(/\/e\/([a-z0-9]+)/i);
  var id = idm ? idm[1] : '';
  if (!id) return Promise.resolve(null);
  var urls = HG_ROTATE_HOSTS.map(function (h) { return 'https://' + h + '/e/' + id; });
  return hgTry(urls, 0);
}

// --- lane 4: voe (follow the embed's own JS redirect, best-effort) ----------
function voeExtract(embedUrl) {
  return fetchText(embedUrl, PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (html) {
    if (!html) return null;
    var follow = html.match(/window\.location\.href\s*=\s*'(https?:\/\/[^']+)'/);
    if (follow && follow[1] && follow[1].indexOf(embedUrl) < 0) {
      return fetchText(follow[1], PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (real) {
        return real ? voeParseReal(real, embedUrl) : null;
      });
    }
    return voeParseReal(html, embedUrl);
  }).catch(function () { return null; });
}

function voeParseReal(html, embedUrl) {
  // direct file markers first, then packed-script unpack, then \x-sourced
  var m = html.match(/["']file["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
    html.match(/hls\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
    html.match(/source\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
  if (!m) {
    var unpacked = unpackPackedScript(html);
    if (unpacked) html = unpacked;
    m = html.match(/["']file["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
      html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
  }
  if (!m) return null;
  var url = m[1] || m[0];
  if (!/^https?:\/\//i.test(url)) return null;
  if (isPlaceholderUrl(url)) return null; // v1.3.0: dead filler embed
  var host = String(embedUrl).replace(/^https?:\/\//i, '').split('/')[0];
  var q = qualityFromText(html);
  return probeHeaderless(url).then(function (ok) {
    return makeRow(url, 'Voe', q, ok ? '' : { Referer: 'https://' + host + '/', 'User-Agent': UA });
  });
}

// v1.3.0: dead-embed filler — hosts that ship a public test clip instead of
// the real file (verified: both mutiny-2026 voe tabs carry a Big Buck Bunny
// mp4). Never ship these as rows.
var PLACEHOLDER_RE = /test-videos\.co\.uk|bigbuckbunny|bbb_sunflower|gtv-videos-bucket|sample-videos\.com|file-examples\.com|w3schools\.com|commondatastorage\.googleapis\.com/i;

function isPlaceholderUrl(u) {
  return PLACEHOLDER_RE.test(String(u || ''));
}

// --- lane 5: unknown hosts — cheap inline probe -----------------------------
function genericExtract(embedUrl) {
  var hm = String(embedUrl).match(/^https?:\/\/([^\/]+)/i);
  var label = hm ? hm[1].replace(/^www\./, '') : 'Embed';
  return fetchText(embedUrl, PENCURI_BASE + '/', EMBED_TIMEOUT_MS).then(function (html) {
    if (!html) return null;
    if (/challenges\.cloudflare\.com|captcha-player|turnstile/i.test(html)) return null;
    var m = html.match(/["']file["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
      html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
    if (!m) return null;
    var url = m[1] || m[0];
    if (!/^https?:\/\//i.test(url)) return null;
    if (isPlaceholderUrl(url)) return null; // v1.3.0: dead filler embed
    var q5 = qualityFromText(html);
    return probeHeaderless(url).then(function (ok) {
      return makeRow(url, label, q5, ok ? '' : { Referer: embedUrl, 'User-Agent': UA });
    });
  }).catch(function () { return null; });
}

function extractEmbed(embedUrl) {
  var u = String(embedUrl);
  if (/mixdrop/i.test(u)) return mixdropExtract(u);
  if (/streamtape|streamta\.pe|tapewithadblock/i.test(u)) return streamtapeExtract(u);
  if (DOOD_HOST_RE.test(u.replace(/^https?:\/\//i, '').split('/')[0])) return doodExtract(u);
  if (/hgcloud|hglink|streamhg/i.test(u)) return hgcloudExtract(u);
  if (/voe\.[a-z]+|johnfullwonder|audaciouslily/i.test(u)) return voeExtract(u);
  return genericExtract(u);
}

// ---------------------------------------------------------------------------
// resolve a movie/series page into rows

function dedupeRows(rows) {
  var seen = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || !r.url) continue;
    // v1.3.0: key on the FULL url (host + path + QUERY). Stripping the query
    // — the old behavior — collapsed Streamtape's two get_video embeds into
    // one row, because the file id lives in the query (?id=...&token=...).
    // Only the #fragment is ignored (pure client-side decoration).
    var key = String(r.url).replace(/^https?:\/\//i, '').replace(/#.*$/, '');
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(r);
  }
  // keep same-host multi-file pairs (different ids) — they differ by URL;
  // label the later duplicates per host so the user can tell them apart
  var perHost = {};
  for (var j = 0; j < out.length; j++) {
    var hm = out[j].name.split(' | ')[1] || 'Embed';
    perHost[hm] = (perHost[hm] || 0) + 1;
    if (perHost[hm] > 1) {
      out[j].name = out[j].title = out[j].name + ' #' + perHost[hm];
    }
  }
  return out;
}

function resolvePageRows(html) {
  var embeds = collectEmbeds(html);
  if (!embeds.length) return Promise.resolve([]);
  return Promise.all(embeds.map(function (u) {
    return extractEmbed(u).catch(function () { return null; });
  })).then(function (rows) {
    return dedupeRows(rows);
  });
}

function resolveFromDetail(html, slug, season, episode, pageUrl) {
  if (isSeriesPage(html)) {
    var epLinks = collectEpisodeLinks(html);
    if (epLinks.length) {
      var want = parseInt(episode, 10) || 1;
      var epSlug = pickEpisodeLink(epLinks, season, want);
      if (!epSlug) {
        // construct the canonical shape as a last resort (verified pattern)
        epSlug = slugBase(slug) + '-season-' + (parseInt(season, 10) || 1) + '-episode-' + want;
      }
      var epUrl = PENCURI_BASE + '/episode/' + epSlug;
      return fetchText(epUrl, pageUrl, PAGE_TIMEOUT_MS).then(function (epHtml) {
        if (!epHtml) {
          // fall back to the season-less shape before giving up
          var alt = PENCURI_BASE + '/episode/' + slugBase(slug) + '-episode-' + (parseInt(episode, 10) || 1);
          return fetchText(alt, pageUrl, PAGE_TIMEOUT_MS).then(function (altHtml) {
            return altHtml ? resolvePageRows(altHtml) : [];
          });
        }
        return resolvePageRows(epHtml);
      });
    }
  }
  return resolvePageRows(html);
}

// v1.1.0: series detail pages live at /series/{slug}/ (the bare /{slug}/
// shape only 301s — a round-trip that dies if the site drops the redirect).
// hintSeries (from the mediaType arg, explicit s/e, or the search row's own
// type) picks which shape goes first; the other is always tried on failure.
function resolveBySlug(slug, season, episode, hintSeries, onTitle) {
  var seriesUrl = PENCURI_BASE + '/series/' + slug + '/';
  var plainUrl = PENCURI_BASE + '/' + slug + '/';
  var firstUrl = hintSeries ? seriesUrl : plainUrl;
  var secondUrl = hintSeries ? plainUrl : seriesUrl;
  function looksAlive(html) {
    return !!html && (collectEmbeds(html).length > 0 ||
      collectEpisodeLinks(html).length > 0 || isSeriesPage(html));
  }
  // v1.4.0: fire the English-subtitle lane the moment a live page arrives —
  // og:title "Name (Year)" is all the subtitle resolver needs. onTitle is
  // optional (TMDB-keyed lanes know the title already and never pass one).
  function noteTitle(html) {
    if (!onTitle || !html) return;
    var ty = pageTitle(html);
    if (ty && ty.title) { try { onTitle(ty); } catch (e) {} }
  }
  return fetchText(firstUrl, PENCURI_BASE + '/', PAGE_TIMEOUT_MS).then(function (html) {
    if (looksAlive(html)) { noteTitle(html); return resolveFromDetail(html, slug, season, episode, firstUrl); }
    return fetchText(secondUrl, PENCURI_BASE + '/', PAGE_TIMEOUT_MS).then(function (html2) {
      if (looksAlive(html2)) { noteTitle(html2); return resolveFromDetail(html2, slug, season, episode, secondUrl); }
      return [];
    });
  }).catch(function () {
    return fetchText(secondUrl, PENCURI_BASE + '/', PAGE_TIMEOUT_MS).then(function (html2) {
      if (looksAlive(html2)) { noteTitle(html2); return resolveFromDetail(html2, slug, season, episode, secondUrl); }
      return [];
    }).catch(function () { return []; });
  });
}

// ---------------------------------------------------------------------------
// TMDB-keyed path: numeric / tmdb: / tt: ids

function normalizeTitle(s) {
  return collapseWs(String(s || '').toLowerCase())
    .replace(/[\u2019\u2018']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleScore(a, b) {
  var na = normalizeTitle(a), nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.indexOf(nb) === 0 || nb.indexOf(na) === 0) return 0.85;
  if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return 0.7;
  var wa = na.split(' '), wb = nb.split(' '), hit = 0;
  for (var i = 0; i < wa.length; i++) {
    if (wb.indexOf(wa[i]) >= 0) hit++;
  }
  return wb.length ? hit / wb.length : 0;
}

function tmdbFetch(kind, id) {
  var url = 'https://api.themoviedb.org/3/' + kind + '/' + encodeURIComponent(id) +
    '?api_key=' + TMDB_API_KEY + '&language=en-US';
  return fetchText(url, null, PAGE_TIMEOUT_MS).then(function (body) {
    if (!body) return null;
    try { return JSON.parse(body); } catch (e) { return null; }
  });
}

function parseListingItems(html) {
  // same markup as the addon's parser: data-movie-id -> ml-mask[oldtitle].
  // v1.1.0: series rows href /series/{slug}/ (listing + search, verified
  // live) — capture the optional prefix, slug is the LAST segment, and the
  // prefix pins the series type.
  var items = [], seen = {};
  var chunks = String(html || '').split(/<div data-movie-id="\d+"[^>]*class="ml-item/);
  for (var i = 1; i < chunks.length; i++) {
    var body = chunks[i].length > 4000 ? chunks[i].slice(0, 4000) : chunks[i];
    var a = body.match(/<a href="https?:\/\/[^"]*pencurimovie\.baby\/((?:series|movies)\/)?([a-z0-9][a-z0-9-]*)\/"[^>]*oldtitle="([^"]+)"/i);
    if (!a) continue;
    var prefix = a[1] ? a[1].replace(/\/+$/, '').toLowerCase() : '';
    var slug = a[2];
    if (/^(feed|list-mode|page|wp-json|request-movie|genre|country|series|movies|episode|release|release-year|most|top|search|tag)$/.test(slug)) continue;
    var key = prefix + ':' + slug;
    if (seen[key]) continue;
    seen[key] = 1;
    var title = collapseWs(stripTags(decodeEntities(a[3] || '')));
    var year = '';
    var ym = title.match(/\s*\((\d{4})\)\s*$/);
    if (ym) { year = ym[1]; title = title.replace(/\s*\((\d{4})\)\s*$/, ''); }
    var em = body.match(/class="mli-eps"[\s\S]{0,80}Eps\s*<i>\s*(\d+)/i);
    var isSeries = prefix === 'series' || !!em;
    items.push({ slug: slug, title: title, year: year, type: isSeries ? 'series' : 'movie' });
  }
  return items;
}

function searchSiteByTitle(title) {
  var url = PENCURI_BASE + '/?s=' + encodeURIComponent(String(title || '').trim());
  return fetchText(url, PENCURI_BASE + '/', PAGE_TIMEOUT_MS).then(function (html) {
    return html ? parseListingItems(html) : [];
  });
}

function resolveByTmdb(kind, id, season, episode) {
  return tmdbFetch(kind, id).then(function (info) {
    if (!info) return [];
    var title = info.name || info.title || info.original_name || info.original_title || '';
    var year = String((info.release_date || info.first_air_date || '')).slice(0, 4);
    return searchSiteByTitle(title).then(function (items) {
      var best = null, bestScore = 0;
      for (var i = 0; i < items.length; i++) {
        var s = titleScore(items[i].title, title);
        if (year && items[i].year) {
          if (items[i].year === year) s += 0.15;
          else if (Math.abs(parseInt(items[i].year, 10) - parseInt(year, 10)) <= 1) s += 0.05;
          else s -= 0.2;
        }
        if (s > bestScore) { bestScore = s; best = items[i]; }
      }
      if (!best || bestScore < 0.6) return [];
      return resolveBySlug(best.slug, season, episode, best.type === 'series');
    });
  }).catch(function () { return []; });
}

// ---------------------------------------------------------------------------
// ENGLISH SUBTITLES (v1.4.0)
//
// Stremio's official OpenSubtitles-v3 addon, keyless:
//   GET {base}/subtitles/{movie|series}/{imdbId}[:s:e].json
//     -> { subtitles: [{ url, lang, subtitleFileName, ... }] }
// The returned urls (subs5.strem.io/.../subencoding-stremio-utf8/...) are
// plain UTF-8 SRT downloads. Every lane resolves its IMDb id fail-soft and
// IN PARALLEL with host extraction; rows without a resolvable imdb simply
// ship without subs (never an error).

// og:title / <title> -> { title, year } ("Mutiny (2026)" -> mutiny/2026)
function pageTitle(html) {
  var s = String(html || '');
  var m = s.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    s.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
  if (!m) m = s.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m) return { title: '', year: '' };
  var raw = collapseWs(stripTags(decodeEntities(m[1] || '')));
  raw = raw.replace(/\s*-\s*Pencuri Movie.*$/i, '').trim();
  var ym = raw.match(/\((19|20)\d{2}\)/);
  var year = ym ? ym[0].replace(/[()]/g, '') : '';
  var title = raw.replace(/\s*\((19|20)\d{2}\)\s*/, '').trim();
  return { title: title, year: year };
}

// generic TMDB GET (path already carries the query string sans api_key)
function tmdbGet(path) {
  var url = 'https://api.themoviedb.org/3' + path +
    (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + TMDB_API_KEY + '&language=en-US';
  return fetchText(url, null, PAGE_TIMEOUT_MS).then(function (body) {
    if (!body) return null;
    try { return JSON.parse(body); } catch (e) { return null; }
  }).catch(function () { return null; });
}

// kind+tmdbId -> imdb id ("" when none — fail-soft)
function tmdbExternalImdb(kind, tmdbId) {
  return tmdbGet('/' + kind + '/' + encodeURIComponent(String(tmdbId)) + '/external_ids').then(function (d) {
    return (d && d.imdb_id) ? String(d.imdb_id) : '';
  });
}

// page title+year -> TMDB search (year-matched best) -> external_ids -> imdb
function imdbFromPageTitle(title, year, isTv) {
  if (!title) return Promise.resolve('');
  var kind = isTv ? 'tv' : 'movie';
  var q = '/search/' + kind + '?query=' + encodeURIComponent(String(title).trim()) +
    (year ? '&year=' + encodeURIComponent(year) : '');
  return tmdbGet(q).then(function (d) {
    if (!d || !Array.isArray(d.results) || !d.results.length) return '';
    var best = d.results[0], i;
    if (year) {
      for (i = 0; i < d.results.length; i++) {
        var rd = String(d.results[i].release_date || d.results[i].first_air_date || '');
        if (rd.indexOf(year) === 0) { best = d.results[i]; break; }
      }
    }
    return best && best.id ? tmdbExternalImdb(kind, String(best.id)) : '';
  }).catch(function () { return ''; });
}

function subKey(imdbId, mediaType, season, episode) {
  var base = String(imdbId) + ':' + (mediaType === 'tv' ? 's' : 'm');
  if (mediaType === 'tv') base += ':' + (parseInt(season, 10) || 1) + ':' + (parseInt(episode, 10) || 1);
  return base;
}

// English tracks for an imdb id (episode-scoped for tv). 4 max, clean
// before hearing-impaired, 30min cache. Never rejects, never throws.
function englishSubsFor(imdbId, mediaType, season, episode) {
  if (!/^tt\d+/i.test(String(imdbId || ''))) return Promise.resolve([]);
  var key = subKey(imdbId, mediaType, season, episode);
  var hit = _subsCache[key];
  if (hit && (Date.now() - hit.ts) < SUBS_CACHE_TTL) return Promise.resolve(hit.value);
  var path = mediaType === 'tv'
    ? '/subtitles/series/' + encodeURIComponent(String(imdbId)) + ':' + (parseInt(season, 10) || 1) + ':' + (parseInt(episode, 10) || 1) + '.json'
    : '/subtitles/movie/' + encodeURIComponent(String(imdbId)) + '.json';
  return fetchText(OS_V3_BASE + path, null, SUBS_TIMEOUT_MS).then(function (body) {
    var data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) { data = null; }
    var list = (data && Array.isArray(data.subtitles)) ? data.subtitles : [];
    var eng = [], i;
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || !s.url) continue;
      var lang = String(s.lang || s.language || '').toLowerCase();
      if (lang !== 'eng' && lang.indexOf('en') !== 0) continue;
      var fname = String(s.subtitleFileName || s.movieReleaseName || '');
      var hi = /(^|[.\-_ ])(hi|sdh)([.\-_ ])|hearing.impaired/i.test(fname);
      eng.push({ s: s, hi: hi });
    }
    // clean tracks first, then HI; stable within groups
    eng.sort(function (a, b) { return (a.hi ? 1 : 0) - (b.hi ? 1 : 0); });
    var out = [], seen = {};
    for (i = 0; i < eng.length && out.length < 4; i++) {
      var u = eng[i].s.url;
      if (seen[u]) continue;
      seen[u] = true;
      out.push({ url: u, language: 'en', name: eng[i].hi ? 'English (HI)' : 'English' });
    }
    _subsCache[key] = { ts: Date.now(), value: out };
    return out;
  }).catch(function () { return []; });
}

// one-shot deferred WITHOUT timers (the device runtime has none): the
// page-title callback fires it with the imdb promise, whose RESOLVED VALUE
// (the imdb id string, "" when unresolvable) is what gate.promise settles
// to (native promise adoption unwraps fired promises); if the page dies it
// is settled with null by the rows settlement, so Promise.all never hangs.
function makeTitleGate() {
  var done = false, fire = null;
  var p = new Promise(function (resolve) { fire = resolve; });
  return {
    promise: p,
    fire: function (v) { if (!done) { done = true; try { fire(v); } catch (e) {} } }
  };
}

// attach the (shared) subtitle array to every resolved row — the netmirror
// v5 pattern Nuvio's runtime is proven against; fail-soft on both sides.
function withSubs(rowsJob, subsJob, tag) {
  return Promise.all([
    Promise.resolve(rowsJob).catch(function () { return []; }),
    Promise.resolve(subsJob).catch(function () { return []; })
  ]).then(function (arr) {
    var rows = arr[0] || [];
    var subs = arr[1] || [];
    if (subs.length && rows.length) {
      for (var i = 0; i < rows.length; i++) {
        try { rows[i].subtitles = subs; } catch (e) {}
      }
      console.log('[Pencuri] ' + subs.length + ' English subtitle track(s) attached' + (tag ? ' (' + tag + ')' : ''));
    }
    return rows;
  });
}

// ---------------------------------------------------------------------------
// entry

function getStreams(videoId, mediaType, season, episode) {
  // mediaType-slot detection (mirrors animotvslash/miruro 2.7.0): the 4-arg
  // Nuvio contract is (id, type, season, episode); legacy 3-arg callers pass
  // (id, season, episode) — never let the slots shift.
  var mtSlot = String(mediaType == null ? '' : mediaType).toLowerCase();
  if (mtSlot !== 'movie' && mtSlot !== 'tv' && mtSlot !== 'series' &&
    mtSlot !== 'show' && mtSlot !== 'tv_show' && mtSlot !== 'tvshow') {
    if (mediaType !== undefined && mediaType !== null && mtSlot !== '') {
      episode = season;
      season = mediaType;
      mediaType = undefined;
    }
  }
  var idStr = String(videoId == null ? '' : videoId).trim();
  if (!idStr) return Promise.resolve([]);
  if (idStr.indexOf('%') >= 0) {
    try { var dec = decodeURIComponent(idStr); if (dec) idStr = String(dec).trim(); } catch (e) {}
  }
  console.log('[Pencuri] start ' + idStr + (mediaType ? ' (' + mediaType + ')' : '') +
    ' S' + (parseInt(season, 10) || 1) + 'E' + (parseInt(episode, 10) || 1));

  var argSeason = parseInt(season, 10) > 0 ? parseInt(season, 10) : 0;
  var argEpisode = parseInt(episode, 10) > 0 ? parseInt(episode, 10) : 0;
  var hintSeries = mtSlot === 'tv' || mtSlot === 'series' || mtSlot === 'show' ||
    mtSlot === 'tv_show' || mtSlot === 'tvshow';

  var catalog = parsePencuriCatalogId(idStr);
  if (catalog) {
    if (catalog.source === 'foreign' || !catalog.slug) {
      console.log('[Pencuri] foreign asian: id -> skipping');
      return Promise.resolve([]);
    }
    // v1.1.0: episode-id suffixes on pen ids ("asian:pen-<slug>:1:3") carry
    // the tapped s/e when the app passes no explicit args.
    var catS = argSeason > 0 ? argSeason : catalog.season;
    var catE = argEpisode > 0 ? argEpisode : catalog.episode;
    var catHint = hintSeries || catS > 0 || catE > 0;
    // v1.4.0: the page's og:title fires the parallel English-subtitle lane
    // the moment resolveBySlug touches a live page; if the page is dead the
    // gate settles with the rows and the call returns whatever hosts gave.
    var gate = makeTitleGate();
    var rowsJob = resolveBySlug(catalog.slug, catS, catE, catHint, function (ty) {
      gate.fire(ty && ty.title ? imdbFromPageTitle(ty.title, ty.year, catHint) : null);
    }).then(function (rows) {
      gate.fire(null); // no-op when onTitle already fired; unhangs dead pages
      return rows;
    });
    var subsJob = gate.promise.then(function (im) {
      // gate.promise resolves to the UNWRAPPED value of the fired promise:
      // the imdb id string ("" when unresolvable) or null when the page died.
      return englishSubsFor(im || '', catHint ? 'tv' : 'movie', catS, catE);
    });
    return withSubs(rowsJob, subsJob, 'catalog lane');
  }

  // v1.1.0: tolerate tapped-episode decorations ("tmdb:<id>:<s>:<e>",
  // ":<e>" single, "/"-separated) — the old strict regex rejected the exact
  // id Nuvio passes for every TMDB-meta series episode tap
  // (buildPlaybackVideoId -> content.id + ":" + s + ":" + e).
  var tmParts = idStr.replace(/^tmdb:/i, '').split(/[:\/]/);
  if (/^\d+$/.test(tmParts[0])) {
    var tmm = tmParts[0];
    var decS = tmParts.length >= 3 ? (parseInt(tmParts[1], 10) || 0) : 0;
    var decE = tmParts.length >= 2 ? (parseInt(tmParts[tmParts.length - 1], 10) || 0) : 0;
    var useS = argSeason > 0 ? argSeason : decS;
    var useE = argEpisode > 0 ? argEpisode : decE;
    var isTv = mediaType ? (mtSlot === 'tv' || mtSlot === 'series' || mtSlot === 'show' ||
      mtSlot === 'tv_show' || mtSlot === 'tvshow') : true;
    var kind = isTv ? 'tv' : 'movie';
    // try the requested kind, then the other (site rows are typed by badge
    // but TMDB ids arrive from the addon with the catalog's type)
    // v1.4.0: external_ids runs in PARALLEL with the site search/extraction
    var imdbJob = tmdbExternalImdb(kind, tmm);
    return resolveByTmdb(kind, tmm, useS, useE).then(function (rows) {
      if (rows.length) {
        return withSubs(Promise.resolve(rows), imdbJob.then(function (im) {
          return englishSubsFor(im, kind, useS, useE);
        }), 'tmdb lane');
      }
      var flipped = kind === 'tv' ? 'movie' : 'tv';
      return withSubs(resolveByTmdb(flipped, tmm, useS, useE),
        tmdbExternalImdb(flipped, tmm).then(function (im2) {
          return englishSubsFor(im2, flipped, useS, useE);
        }), 'tmdb lane (flipped)');
    });
  }

  var im = idStr.match(/^tt(\d+)/i);
  if (im) {
    var ttS = argSeason > 0 ? argSeason : (tmParts.length >= 3 ? (parseInt(tmParts[1], 10) || 0) : 0);
    var ttE = argEpisode > 0 ? argEpisode : (tmParts.length >= 2 ? (parseInt(tmParts[tmParts.length - 1], 10) || 0) : 0);
    var findUrl = 'https://api.themoviedb.org/3/find/tt' + im[1] +
      '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id';
    return fetchText(findUrl, null, PAGE_TIMEOUT_MS).then(function (body) {
      if (!body) return [];
      var data = null;
      try { data = JSON.parse(body); } catch (e) { return []; }
      var mv = data && data.movie_results && data.movie_results[0];
      var tv = data && data.tv_results && data.tv_results[0];
      // v1.4.0: the imdb id is KNOWN here — subs fetch in parallel with the
      // TMDB->site-search->extraction chain, typed by the find result.
      if (mv && mv.id) {
        return withSubs(resolveByTmdb('movie', mv.id, ttS, ttE),
          englishSubsFor('tt' + im[1], 'movie', ttS, ttE), 'tt lane');
      }
      if (tv && tv.id) {
        return withSubs(resolveByTmdb('tv', tv.id, ttS, ttE),
          englishSubsFor('tt' + im[1], 'tv', ttS, ttE), 'tt lane');
      }
      return [];
    });
  }

  // bare slug-ish id (stale caches): strip any numeric decorations first
  var slugish = idStr.replace(/(?:[:\/]\d+)+$/, '');
  if (/^[a-z0-9][a-z0-9-]*$/i.test(slugish)) {
    // v1.4.0: same page-title gate as the catalog lane
    var slugHint = hintSeries || argEpisode > 0;
    var gate2 = makeTitleGate();
    var rows2 = resolveBySlug(slugish.toLowerCase(), season, episode, slugHint, function (ty) {
      gate2.fire(ty && ty.title ? imdbFromPageTitle(ty.title, ty.year, slugHint) : null);
    }).then(function (rows) {
      gate2.fire(null);
      return rows;
    });
    var subs2 = gate2.promise.then(function (im) {
      return englishSubsFor(im || '', slugHint ? 'tv' : 'movie', argSeason, argEpisode);
    });
    return withSubs(rows2, subs2, 'slug lane');
  }
  return Promise.resolve([]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
  // v1.4.0 test hooks (guarded; never used by the apps)
  module.exports.__internals = {
    englishSubsFor: englishSubsFor,
    parsePencuriCatalogId: parsePencuriCatalogId,
    pageTitle: pageTitle,
    imdbFromPageTitle: imdbFromPageTitle,
    makeTitleGate: makeTitleGate,
    _subsCache: _subsCache
  };
} else if (typeof global !== 'undefined') {
  global.getStreams = getStreams;
}
