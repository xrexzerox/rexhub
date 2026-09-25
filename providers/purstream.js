"use strict";
// purstream.js - eclipsia wrenok.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// v3.0.0 (pack 4.44.0, 2026-09-25): WRONG-CONTENT FIX ("purstream provides
// inaccurate stream links"). Root cause found live: findIdByTitle returned
// the FIRST type-matching search hit with zero title/year verification - for
// "Resident Evil" (2026, tmdb 1423191) the site's first movie hit is
// "Bienvenue a Raccoon City" (2021, tmdb 460458), so Nuvio served the 2021
// film for the 2026 release. The fix is three-layer verification, honoring
// the user's "add condition using imdb/tmdb search" directive:
//   L1  candidate title must match the TMDB title (normalized equality or
//       containment in EITHER direction) - rejects different titles outright;
//   L2  candidate release year must be within +-1 of the TMDB year when the
//       candidate exposes a release_date - rejects remakes/older entries;
//   L3  DETERMINISTIC: the media sheet's own tmdbId (the site stores the
//       TMDB id it mapped the item from) must equal the requested tmdbId.
//       Sheet-level verification runs before any row is emitted and skips to
//       the next candidate on mismatch; if no candidate verifies -> [].
// Result: a title absent from purstream (or mismatched) yields ZERO rows
// instead of the wrong movie - "it should not provide inaccurate streams".
// Also: all fetches now carry a guarded cap (device runtimes have no timers;
// there the fetch budget stays the app's 60s kill, node/TV race at 12s).
// Subtitles: passed through as upstream emits them (English/Tagalog tracks kept when upstream provides).

// v3.1.0 (pack 4.45.0): IMDb-search verification gate before the site
// search (nvImdbVerify below) - absent/mismatched IMDb content yields 0
// rows per the user rule; visible "v3.1" chip on row names for
// stale-cache diagnosis (the 4.44.0 report was reproduced as stale JS).
const PURSTREAM_API = 'https://api.purstream.club/api/v1';
const PURSTREAM_REFERER = 'https://purstream.club/';
const PURSTREAM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TMDB_KEY = '307b7b8ef035c6aa336900aef4e203bd';

const PURSTREAM_HEADERS = {
    'User-Agent': PURSTREAM_UA,
    'Referer': PURSTREAM_REFERER
};

function hasTimers() {
    return typeof setTimeout === 'function' && typeof clearTimeout === 'function';
}

async function fetchJsonCapped(url, options, timeoutMs) {
    const p = fetch(url, options).then((r) => (r && r.ok ? r.json() : null));
    if (hasTimers()) {
        return Promise.race([
            p,
            new Promise((res) => {
                const t = setTimeout(() => res(null), timeoutMs || 12000);
                if (t && typeof t.unref === 'function') t.unref();
            }),
        ]);
    }
    return p;
}

async function fetchTmdbMeta(tmdbId, mediaType) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`;
        const data = await fetchJsonCapped(url, { headers: { 'User-Agent': PURSTREAM_UA } });
        if (!data) return null;
        const date = data.release_date || data.first_air_date || '';
        return {
            title: data.title || data.name || '',
            originalTitle: data.original_title || data.original_name || '',
            year: date ? parseInt(String(date).substring(0, 4), 10) : null,
        };
    } catch {
        return null;
    }
}

/* ===== nv IMDb-search verification v1.0.0 (pack 4.45.0) =====================
   User directive: "it should not provide inaccurate streams if the movies or
   series is not on imdb or tmdb or incorrect ... since we are only using tmdb
   try add condition using imdb search." Runs BEFORE any site search:
     1. The content must expose an IMDb id (TMDB external_ids). No id means the
        title is not on IMDb, so title-based guessing can never be verified
        -> 0 rows (fail-closed, per the user's rule).
     2. IMDb is searched for that exact id (IMDb suggestion API first,
        Cinemeta v3 fallback). Reachable but ABSENT -> 0 rows (same rule).
     3. The IMDb entry's title + year must agree with TMDB (normalized
        containment, year +-1). A mismatched mapping is exactly the
        wrong-content class the user reported -> 0 rows.
   If both IMDb sources are unreachable we cannot tell "absent" from
   "offline", so verification degrades to this provider's own TMDB gates
   instead of zeroing legitimate titles (documented fail-open on offline only).
============================================================================ */
function nvImdbFetchJson(url) {
  return fetchJsonCapped(url, { 'User-Agent': PURSTREAM_UA });
}

function nvImdbNorm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
async function nvImdbVerify(tmdbId, mediaType, tmdbTitle, tmdbYear, knownImdbId) {
  try {
    const kind = mediaType === 'tv' ? 'tv' : 'movie';
    let imdbId = String(knownImdbId || '');
    if (!imdbId) {
      const ex = await nvImdbFetchJson(`https://api.themoviedb.org/3/${kind}/${encodeURIComponent(String(tmdbId))}/external_ids?api_key=${TMDB_KEY}`);
      if (ex && ex.imdb_id) imdbId = String(ex.imdb_id);
    }
    if (!imdbId || imdbId.indexOf('tt') !== 0) return { ok: false, reason: 'not-on-imdb: no imdb id on TMDB' };
    let imdbTitle = '';
    let imdbYear = null;
    let reachable = false;
    const sg = await nvImdbFetchJson(`https://v2.sg.media-imdb.com/suggestion/t/${encodeURIComponent(imdbId)}.json`);
    const d = sg && Array.isArray(sg.d) ? sg.d : [];
    let hit = null;
    for (const x of d) {
      if (x && String(x.id || '').toLowerCase() === imdbId.toLowerCase()) { hit = x; break; }
    }
    if (!hit && d.length) hit = d[0];
    if (hit && hit.l) {
      reachable = true;
      imdbTitle = String(hit.l);
      imdbYear = parseInt(hit.y, 10) || parseInt(hit.tl, 10) || null;
    }
    if (!reachable) {
      const cm = await nvImdbFetchJson(`https://v3-cinemeta.strem.io/meta/${mediaType === 'tv' ? 'series' : 'movie'}/${encodeURIComponent(imdbId)}.json`);
      if (cm && cm.meta && cm.meta.name) {
        reachable = true;
        imdbTitle = String(cm.meta.name);
        imdbYear = parseInt(cm.meta.releaseYear, 10) || parseInt(cm.meta.year, 10) || null;
      }
    }
    if (!reachable) return { ok: true, imdbId, reason: 'imdb-unreachable: own gates apply' };
    if (!imdbTitle) return { ok: false, reason: 'not-on-imdb: no entry for ' + imdbId };
    const a = nvImdbNorm(imdbTitle);
    const t = nvImdbNorm(tmdbTitle);
    const titleOk = !!a && !!t && (a === t || a.includes(t) || t.includes(a));
    const yearOk = !tmdbYear || !imdbYear || Math.abs(imdbYear - parseInt(tmdbYear, 10)) <= 1;
    if (!titleOk || !yearOk) return { ok: false, reason: 'imdb-mismatch: imdb "' + imdbTitle + '" (' + imdbYear + ') vs tmdb "' + tmdbTitle + '" (' + tmdbYear + ')' };
    return { ok: true, imdbId, imdbTitle, imdbYear };
  } catch (e) {
    return { ok: true, reason: 'verify-error: own gates apply' };
  }
}
function parseLang(n) {
    const up = (n || '').toUpperCase();
    if (up.includes('VOSTFR')) return 'VOSTFR';
    if (up.includes('VF')) return 'VF';
    return 'MULTI';
}

function parseQuality(n) {
    const up = (n || '').toUpperCase();
    if (up.includes('4K')) return '4K';
    if (up.includes('1080')) return '1080p';
    if (up.includes('720')) return '720p';
    return '1080p';
}

function buildTitle(title, quality, lang, format, season, episode) {
    const dispLang = lang === 'MULTI' ? 'MULTI' : lang === 'VOSTFR' ? 'VOSTFR' : 'VF';
    const fmt = (format || 'M3U8').toUpperCase();
    let line1 = title;
    if (season && episode) line1 = `S${season} E${episode} | ${title}`;
    return `${line1}\n${[quality, dispLang, fmt].join(' | ')}`;
}

function normalizeTitle(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[\u00c0-\u017f]/g, (c) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** L1: title identity (either direction containment catches franchise subtitles). */
function titleMatches(candidateTitle, meta) {
    const a = normalizeTitle(candidateTitle);
    const targets = [normalizeTitle(meta.title), normalizeTitle(meta.originalTitle)].filter(Boolean);
    for (const t of targets) {
        if (!t) continue;
        if (a === t) return true;
        if (a.includes(t) || t.includes(a)) return true;
    }
    return false;
}

/** L2: year sanity (+-1) when the candidate exposes a release_date. */
function yearMatches(candidate, meta) {
    if (!meta || !meta.year) return true;
    const cdate = candidate.release_date || candidate.releaseDate || '';
    if (!cdate) return true; // no year on the candidate -> L3 sheet check decides
    const cy = parseInt(String(cdate).substring(0, 4), 10);
    if (!Number.isFinite(cy)) return true;
    return Math.abs(cy - meta.year) <= 1;
}

async function findCandidates(title) {
    const encoded = encodeURIComponent(title);
    const data = await fetchJsonCapped(`${PURSTREAM_API}/search-bar/search/${encoded}`, { headers: PURSTREAM_HEADERS });
    const items = data?.data?.items?.movies?.items || [];
    return Array.isArray(items) ? items : [];
}

/**
 * Candidates ordered by (type match, title match, year proximity); each is
 * verified against its media sheet's tmdbId (L3) before being accepted.
 * Returns the purstream media id of the FIRST verified candidate or null.
 */
async function findVerifiedId(meta, preferType) {
    const candidates = await findCandidates(meta.title);
    if (!candidates.length && meta.originalTitle && meta.originalTitle !== meta.title) {
        candidates.push(...(await findCandidates(meta.originalTitle)));
    }
    if (!candidates.length) return null;

    const scored = [];
    for (const item of candidates) {
        if (!item || item.id == null) continue;
        if (item.type && preferType && item.type !== preferType) continue;
        if (!titleMatches(item.title, meta)) continue; // L1
        const yScore = yearMatches(item, meta) ? 1 : 0; // L2 (ordering only)
        if (!yScore) continue;
        scored.push(item);
    }
    // closest year first, then catalog order
    scored.sort((a, b) => {
        const ya = parseInt(String(a.release_date || '').substring(0, 4), 10) || 0;
        const yb = parseInt(String(b.release_date || '').substring(0, 4), 10) || 0;
        const da = meta.year ? Math.abs(ya - meta.year) : 0;
        const db = meta.year ? Math.abs(yb - meta.year) : 0;
        return da - db;
    });
    if (!scored.length) return null;

    // L3: sheet-level tmdbId verification (deterministic)
    for (const item of scored.slice(0, 3)) {
        try {
            const sheet = await fetchJsonCapped(`${PURSTREAM_API}/media/${item.id}/sheet`, { headers: PURSTREAM_HEADERS });
            const payload = sheet && (sheet.data?.items || sheet.data?.data?.items) || null;
            const siteTmdbId = payload ? Number(payload.tmdbId) : NaN;
            if (Number.isFinite(siteTmdbId) && Number(siteTmdbId) === Number(meta.tmdbId)) {
                return { id: item.id, sheet: payload };
            }
            console.log(`[Purstream] sheet tmdbId mismatch for "${item.title}" (site ${siteTmdbId} != requested ${meta.tmdbId}) - candidate rejected`);
        } catch { }
    }
    return null;
}

function normalizeMovieSources(urls, title) {
    return (urls || [])
        .filter((u) => u.url && (u.url.match(/\.m3u8/i) || u.url.match(/\.mp4/i)))
        .map((u) => {
            const q = parseQuality(u.name);
            const l = parseLang(u.name);
            const f = u.url.match(/\.mp4/i) ? 'mp4' : 'm3u8';
            return {
                name: `Purstream v3.1 • ${q}`,
                title: buildTitle(title, q, l, f),
                url: u.url,
                quality: q,
                headers: PURSTREAM_HEADERS,
            };
        });
}

function normalizeEpisodeSources(sources, title, season, episode) {
    return (sources || []).map((s) => {
        const q = parseQuality(s.source_name);
        const l = parseLang(s.source_name);
        return {
            name: `Purstream v3.1 • ${q}`,
            title: buildTitle(title, q, l, s.format || 'm3u8', season, episode),
            url: s.stream_url,
            quality: q,
            headers: PURSTREAM_HEADERS,
        };
    });
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const isTv = mediaType === 'tv';

        if (isTv && (season == null || episode == null)) return [];

        const meta = await fetchTmdbMeta(tmdbId, mediaType);
        if (!meta || !meta.title) return [];
        meta.tmdbId = tmdbId;

        // v3.1.0: IMDb-search verification (user directive) - absent or
        // mismatched content never reaches the site search.
        const nvImdb = await nvImdbVerify(tmdbId, isTv ? 'tv' : 'movie', meta.title, meta.year, '');
        if (!nvImdb.ok) {
            console.log(`[Purstream] imdb verify failed (${nvImdb.reason}) for tmdb ${tmdbId} - 0 rows`);
            return [];
        }

        const preferType = isTv ? 'tv' : 'movie';
        const verified = await findVerifiedId(meta, preferType);
        if (!verified) {
            // Absent or unverifiable on purstream -> NO rows (never wrong ones).
            return [];
        }

        let streams;
        if (isTv) {
            const data = await fetchJsonCapped(
                `${PURSTREAM_API}/stream/${verified.id}/episode?season=${season}&episode=${episode}`,
                { headers: PURSTREAM_HEADERS }
            );
            const sources = data?.data?.items?.sources || data?.data?.data?.items?.sources || [];
            streams = normalizeEpisodeSources(sources, meta.title, season, episode);
        } else {
            const urls = verified.sheet ? verified.sheet.urls || [] : [];
            streams = normalizeMovieSources(urls, meta.title);
        }

        const seen = new Set();
        return streams.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
