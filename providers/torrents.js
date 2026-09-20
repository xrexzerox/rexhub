// ============================================
// nv-plugins torrents.js v2.0.0 (4.32.0 merge)
// ============================================
// THE single torrent provider of the pack (4.32.0 merge per user request:
// "combine torrentio and torrents seems it redundant already").
//
// What changed vs 4.31.0:
//   - torrentio.js is GONE from the pack. This file now covers BOTH Stremio
//     backends the two old providers split between them:
//       * torrentio.strem.fun  (Torrentio)
//       * torrentsdb.com       (TorrentsDB)
//     so rows are no longer duplicated across two provider slots.
//   - Parsing pattern = the device-proven torrentio v1.2.0 real-field parser:
//     Torrentio ships description=null on every row; the real data lives in
//     `title` ("filename\n👤 N 💾 size ⚙️ tracker") and the quality tag in
//     `name` ("Torrentio\n1080p"). Seeders < 5 are dropped (user rule), and
//     rows whose quality cannot be parsed are dropped ("Unknown" rows gone).
//   - NEW quality whitelist (user rule 4.32.0): 720p and 1080p ONLY.
//     2160p/4K, 1440p, 480p and 360p rows are dropped before they render.
//   - Debrid: when a debrid provider+key is configured in the gear icon, the
//     Torrentio request gets the /provider=key path prefix (instant cached
//     http links). Without debrid both backends return infoHashes which are
//     built into magnets (Nuvio resolves magnets via its own debrid/P2P).
//   - The injected nvio post-filter (en/tl audio gate, >=720p gate,
//     cross-provider dedupe) stays attached below, unchanged.

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

// v1.4: base URLs can be overridden (mirror / testing). Defaults unchanged.
const SOURCES = [
  { name: 'Torrentio', api: (typeof process !== 'undefined' && process.env && process.env.TORRENTIO_API_BASE) || 'https://torrentio.strem.fun', debrid: true },
  { name: 'TorrentsDB', api: (typeof process !== 'undefined' && process.env && process.env.TORRENTSDB_API_BASE) || 'https://torrentsdb.com/eyJsaW1pdCI6IjUiLCJkZWJyaWRvcHRpb25zIjpbIm5vZG93bmxvYWRsaW5rcyJdfQ==', debrid: false }
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.birkenwald.de:6969/announce'
];

const MIN_SEEDERS = 5;   // user rule: "dont include 0 seeders minimum is 5 seeders"
const ALLOWED_QUALITY = { '720p': true, '1080p': true }; // user rule 4.32.0: "720/1080p only"
const FETCH_TIMEOUT = 8000; // v1.4: was 6000 - torrentio can be slow under load

function sleep(ms) {
  return new Promise((res) => {
    if (typeof setTimeout !== 'function') return res();
    const t = setTimeout(res, ms);
    if (t && typeof t.unref === 'function') t.unref();
  });
}

function getDebridSettings(cfg) {
  // v1.4: an explicit per-request config (5th getStreams argument, parsed
  // from the addon URL by server.js) wins over the device globals. This
  // keeps concurrent requests with different keys from bleeding into each
  // other without touching any global state.
  try {
    if (cfg && cfg.provider && cfg.key) {
      return {
        provider: String(cfg.provider).toLowerCase().trim(),
        key: String(cfg.key).trim()
      };
    }
  } catch (e) {}
  let provider = 'none';
  let key = '';
  try {
    let settings = null;
    if (typeof global !== 'undefined' && global.SCRAPER_SETTINGS)
      settings = global.SCRAPER_SETTINGS;
    else if (typeof window !== 'undefined' && window.SCRAPER_SETTINGS)
      settings = window.SCRAPER_SETTINGS;
    if (settings) {
      if (settings.debridProvider)
        provider = String(settings.debridProvider).toLowerCase().trim();
      if (settings.debridKey)
        key = String(settings.debridKey).trim();
    }
  } catch (e) {}
  return { provider, key };
}

function getDebridPathSegment(cfg) {
  const { provider, key } = getDebridSettings(cfg);
  if (!provider || provider === 'none' || !key) return '';
  return provider + '=' + key;
}

// stremio tracker entries ("tracker:udp|host:port/announce") -> udp://host:port/announce
function trackerFromSource(src) {
  const s = String(src || '');
  const m = s.match(/^tracker:(https|udp|wss)\|(.+)$/i);
  if (m) return m[1] + '://' + m[2];
  if (/^(https?|udp):\/\//i.test(s)) return s;
  return '';
}

function buildMagnet(infoHash, fileIdx, sources) {
  if (!infoHash) return '';
  const seen = {};
  const trs = [];
  (Array.isArray(sources) ? sources : []).forEach(src => {
    const t = trackerFromSource(src);
    if (t && !seen[t]) { seen[t] = 1; trs.push(t); }
  });
  DEFAULT_TRACKERS.forEach(t => { if (!seen[t]) { seen[t] = 1; trs.push(t); } });
  let magnet = 'magnet:?xt=urn:btih:' + infoHash;
  trs.forEach(t => { magnet += '&tr=' + encodeURIComponent(t); });
  if (fileIdx != null && !isNaN(parseInt(fileIdx, 10))) magnet += '&index=' + parseInt(fileIdx, 10);
  return magnet;
}

function withTimeout(p, ms) {
  if (typeof setTimeout !== 'function') return p;
  return Promise.race([p, new Promise(res => {
    const t = setTimeout(() => res(null), ms);
    if (t && typeof t.unref === 'function') t.unref();
  })]);
}

function emojiFor(quality) {
  if (quality === '1080p') return '💎';
  if (quality === '720p') return '⚡';
  return '📺';
}

// quality detection identical to the device-proven torrentio v1.2.0 parser
function parseQuality(titleBlob, nameBlob) {
  const upper = (titleBlob + ' ' + nameBlob).toUpperCase();
  let quality = '';
  const nameLines = String(nameBlob || '').split('\n');
  if (nameLines.length > 1 && nameLines[1].trim()) {
    const q2 = nameLines[1].trim().toUpperCase().split(/\s+/)[0];
    if (/^(4K|2160P|1440P|1080P|720P|480P|360P)$/.test(q2)) quality = q2 === '4K' ? '2160p' : q2.toLowerCase();
  }
  if (!quality) {
    if (upper.includes('2160P') || upper.includes('4K')) quality = '2160p';
    else if (upper.includes('1440P')) quality = '1440p';
    else if (upper.includes('1080P')) quality = '1080p';
    else if (upper.includes('720P')) quality = '720p';
    else if (upper.includes('480P')) quality = '480p';
    else if (upper.includes('360P')) quality = '360p';
  }
  return quality;
}

function parseTags(titleBlob) {
  const upper = String(titleBlob || '').toUpperCase();
  const tags = [];
  if (upper.includes('DOLBY VISION') || /\bDV\b/.test(upper)) tags.push('DV');
  else if (upper.includes('HDR10+')) tags.push('HDR10+');
  else if (upper.includes('HDR10') || upper.includes('HDR')) tags.push('HDR');
  if (upper.includes('HEVC') || upper.includes('X265') || upper.includes('H265')) tags.push('HEVC');
  if (upper.includes('REMUX')) tags.push('REMUX');
  if (upper.includes('BLURAY') || upper.includes('BLU-RAY')) tags.push('BluRay');
  else if (upper.includes('WEB-DL') || upper.includes('WEBRIP') || /\bWEB\b/.test(upper)) tags.push('Web');
  return tags.join(' • ');
}

function parseSeeders(titleBlob) {
  const m = String(titleBlob || '').match(/👤\s*[:\s]*(\d+)/) || String(titleBlob || '').match(/(?:^|\s)(\d+)\s*👤/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseSize(titleBlob) {
  const m = String(titleBlob || '').match(/💾\s*[:\s]*([\d.,]+\s*[KMG]B)/i) || String(titleBlob || '').match(/([\d.,]+\s*[GM]B)/i);
  return m ? m[1].trim().toUpperCase() : '';
}

function parseSourceTag(titleBlob) {
  let source = '';
  const srcMatch = String(titleBlob || '').match(/⚙[^\r\n\w]*([^\r\n]+)\s*$/m);
  if (srcMatch) source = srcMatch[1].trim();
  if (!source) {
    const bracketMatch = String(titleBlob || '').match(/\[([^\]]+)\]/);
    if (bracketMatch) source = bracketMatch[1].trim();
  }
  if (source && /\d+P|HEVC|H264|WEB|BLURAY|X264|X265/i.test(source)) return '';
  return source;
}

// one stremio backend -> parsed rows (real-field pattern, all filters applied)
function parseBackendRows(sourceName, data, isTV, title, year, season, episode) {
  const out = [];
  const streams = (data && data.streams) || [];
  streams.forEach(torrent => {
    if (!torrent) return;
    const titleBlob = String(torrent.title || torrent.description || '');
    if (!titleBlob) return;
    const nameBlob = String(torrent.name || '');

    const seeders = parseSeeders(titleBlob);
    if (!seeders || seeders < MIN_SEEDERS) return; // no 0/unknown-seeder rows

    const quality = parseQuality(titleBlob, nameBlob);
    if (!quality) return;                       // would render as "Unknown"
    if (!ALLOWED_QUALITY[quality]) return;      // 720p/1080p only (user rule)

    const url = torrent.url || buildMagnet(torrent.infoHash, torrent.fileIdx, torrent.sources);
    if (!url) return;

    const size = parseSize(titleBlob);
    const srcTag = parseSourceTag(titleBlob);
    const tagLine = parseTags(titleBlob);

    const titleLine = isTV
      ? (title ? '🎬 ' + title + ' | ' : '🎬 ') + 'S' + (season || 1) + ' E' + (episode || 1)
      : '🎬 ' + title + (year ? ' (' + year + ')' : '');
    const qualityLine = emojiFor(quality) + ' ' + quality.toUpperCase() + (tagLine ? ' | ' + tagLine : '');
    const infoLine = '👤 ' + seeders + (size ? ' | 💾 ' + size : '') + (srcTag ? ' | 📡 ' + srcTag : '');
    const fullTitle = titleLine + '\n' + qualityLine + '\n' + infoLine;

    out.push({
      name: sourceName + ' | 👤 ' + seeders + ' | ' + quality.toUpperCase(),
      title: fullTitle,
      size: fullTitle,
      description: fullTitle,
      quality: quality,
      url: url,
      seeders: seeders
    });
  });
  return out;
}

async function fetchBackend(source, isTV, imdbId, season, episode) {
  const debridSegment = source.debrid ? getDebridPathSegment(source.__cfg) : '';
  const prefix = debridSegment ? debridSegment + '/' : '';
  const streamId = isTV
    ? 'series/' + imdbId + ':' + (season || 1) + ':' + (episode || 1)
    : 'movie/' + imdbId;
  const url = source.api + '/' + prefix + 'stream/' + streamId + '.json';
  try {
    const r = await withTimeout(fetch(url, { headers: HEADERS }), FETCH_TIMEOUT);
    if (!r || !r.ok) {
      // v1.4: make upstream failures VISIBLE in the logs - a silent null here
      // is how "torrents not working" used to look like a mystery.
      console.error('[Torrents] ' + source.name + (prefix ? ' (debrid)' : '') + ' HTTP ' + (r ? r.status : 'no-response'));
      return null;
    }
    return await withTimeout(r.json(), 2000);
  } catch (e) {
    console.error('[Torrents] ' + source.name + (prefix ? ' (debrid)' : '') + ' fetch failed: ' + (e && e.message));
    return null;
  }
}

// v1.4: one retry per backend. Torrentio intermittently answers 429/5xx or
// drops connections under load; a single retry ~700ms later recovers most
// of those windows without meaningfully slowing the lane (the runner cap
// and the post-filter cap below still bound the worst case).
async function fetchBackendRetry(source, isTV, imdbId, season, episode) {
  const first = await fetchBackend(source, isTV, imdbId, season, episode);
  if (first) return first;
  await sleep(700);
  return fetchBackend(source, isTV, imdbId, season, episode);
}

async function getStreams(tmdbId, type = 'movie', season = null, episode = null, cfg = null) {
  const isTV = type === 'tv' || type === 'series';

  // tt-ids (addon catalog rows) resolve through the /find endpoint
  const isTT = /^tt\d+/i.test(String(tmdbId));
  const tmdbUrl = isTT
    ? 'https://api.themoviedb.org/3/find/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id'
    : 'https://api.themoviedb.org/3/' + (isTV ? 'tv' : 'movie') + '/' + tmdbId +
      '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';

  try {
    // v1.4: the TMDB lookup can come back null (coalescing shim cold burst,
    // momentary TMDB throttle). Retry ONCE after a short pause - the retry
    // usually hits the shim cache that the other ~35 providers have warmed
    // by then. Without this, the lane silently queried torrentio with the
    // numeric tmdb id as imdb id and returned 0 rows.
    let tmdbData = await withTimeout(fetch(tmdbUrl).then(r => r.ok ? r.json() : null).catch(() => null), 5000);
    if (!tmdbData) {
      await sleep(1200);
      tmdbData = await withTimeout(fetch(tmdbUrl).then(r => r.ok ? r.json() : null).catch(() => null), 5000);
    }
    const hit = isTT
      ? (tmdbData?.tv_results?.[0] || tmdbData?.movie_results?.[0] || null)
      : tmdbData;
    // v1.4: NEVER fall back to the numeric tmdb id as an imdb id - that
    // garbage query silently poisoned the lane with 0 rows. tt-ids go
    // straight to torrentio (it accepts them natively); for tmdb ids a
    // failed lookup means: skip this round (the runner's short-TTL cache
    // path makes the next open retry).
    let imdbId;
    if (isTT) {
      imdbId = tmdbId;
    } else {
      const found = tmdbData?.external_ids?.imdb_id || tmdbData?.imdb_id;
      if (!found) {
        console.error('[Torrents] no imdb id for tmdb ' + tmdbId + ' (tmdb lookup failed) - skipping torrent search this round');
        return [];
      }
      imdbId = found;
    }
    const title = hit?.title || hit?.name || '';
    const year = (hit?.release_date || hit?.first_air_date || '').split('-')[0] || '';

    const debridSegment = getDebridPathSegment(cfg);
    const hasDebrid = !!debridSegment;

    // both backends in parallel, each fail-soft with its own timeout + retry
    const results = await Promise.all(SOURCES.map(src =>
      fetchBackendRetry(Object.assign({}, src, src.debrid ? { __cfg: cfg } : {}), isTV, imdbId, season, episode).catch(() => null)));

    // v1.4: debrid fallback. If the debrid-prefixed Torrentio route failed
    // OR came back empty (nothing cached in the debrid cloud for this
    // title, or an invalid/expired key), fetch the PLAIN route too so the
    // user still gets magnet rows instead of a silent hole in the lane.
    if (hasDebrid && SOURCES[0].debrid) {
      const rows0 = results[0]
        ? parseBackendRows(SOURCES[0].name, results[0], isTV, title, year, season, episode)
        : [];
      if (!rows0.length) {
        console.log('[Torrents] debrid route empty/failed - fetching plain Torrentio magnets as fallback');
        const plain = await fetchBackendRetry(Object.assign({}, SOURCES[0], { debrid: false }), isTV, imdbId, season, episode).catch(() => null);
        if (plain) results[0] = plain;
      }
    }

    const merged = [];
    const seen = {};
    results.forEach((data, i) => {
      if (!data) return;
      parseBackendRows(SOURCES[i].name, data, isTV, title, year, season, episode).forEach(row => {
        const key = String(row.url).slice(0, 120);
        if (seen[key]) return;
        seen[key] = 1;
        merged.push(row);
      });
    });
    merged.sort((a, b) => b.seeders - a.seeders);
    return merged.slice(0, 15);
  } catch (e) {
    console.error('[Torrents] Error:', e);
    return [];
  }
}

async function onSettings() {
  return [
    { type: 'header', label: 'Torrent sources (Torrentio + TorrentsDB)' },
    {
      type: 'select', key: 'debridProvider', label: 'Debrid Provider',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Real-Debrid', value: 'realdebrid' },
        { label: 'Premiumize', value: 'premiumize' },
        { label: 'AllDebrid', value: 'alldebrid' },
        { label: 'DebridLink', value: 'debridlink' },
        { label: 'EasyDebrid', value: 'easydebrid' },
        { label: 'Offcloud', value: 'offcloud' },
        { label: 'TorBox', value: 'torbox' },
        { label: 'Put.io', value: 'putio' }
      ],
      default: 'none'
    },
    {
      type: 'input', isPassword: true, key: 'debridKey',
      label: 'API Key / Token',
      placeholder: 'Enter your Debrid API key',
      description: 'API Key or Access Token for your selected Debrid service.'
    }
  ];
}

module.exports = { getStreams, onSettings };

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
  var PROVIDER = "torrents";
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
    var p = fetch(url, opts).then(function (r) {
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
            // v1.4: hard cap on the whole provider run raised 8s -> 12s so the
            // per-backend retry (fetch fails -> one retry after 700ms) fits;
            // still inside the runner's PROVIDER_TIMEOUT_MS (15s on Render).
            r = Promise.race([r, new Promise(function (res) {
              var dl = setTimeout(function () { res([]); }, 12000);
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
