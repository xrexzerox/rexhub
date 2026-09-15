"use strict";
// movieblast.js - eclipsia jyniq.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: hmac.
// Subtitles: passed through as upstream emits them (English/Tagalog tracks kept when upstream provides).

var B64_CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToB64(bytes) {
  var out = "", i;
  for (i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    var has1 = i + 1 < bytes.length, has2 = i + 2 < bytes.length;
    out += B64_CH.charAt(b0 >> 2);
    out += B64_CH.charAt(((b0 & 3) << 4) | (has1 ? b1 >> 4 : 0));
    out += has1 ? B64_CH.charAt(((b1 & 15) << 2) | (has2 ? b2 >> 6 : 0)) : "=";
    out += has2 ? B64_CH.charAt(b2 & 63) : "=";
  }
  return out;
}

/** UTF-8 encoding of a JS string (charCodeAt walk, surrogate pairs handled). */
function utf8Bytes(str) {
  var out = [], i, c;
  str = String(str);
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length &&
      str.charCodeAt(i + 1) >= 0xdc00 && str.charCodeAt(i + 1) <= 0xdfff) {
      c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(i + 1) - 0xdc00);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      i++;
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/* ===== pure-JS SHA-256 / HMAC (pack house crypto, ported from netmirror.js) ===== */

var K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function sha256Bytes(msg /* number[] */) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var len = msg.length;
  var bitLenHi = Math.floor(len / 536870912);            /* len*8 / 2^32 high */
  var bitLenLo = (len << 3) >>> 0;                       /* low 32 bits (fine for our sizes) */
  var padded = msg.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  padded.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255);
  padded.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255);

  var w = new Array(64);
  for (var b = 0; b < padded.length; b += 64) {
    var i, t;
    for (i = 0; i < 16; i++) {
      var o = b + i * 4;
      w[i] = ((padded[o] << 24) | (padded[o + 1] << 16) | (padded[o + 2] << 8) | padded[o + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
      var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      t = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & bb) ^ (a & c) ^ (bb & c);
      h = g; g = f; f = e;
      e = (d + t) >>> 0;
      d = c; c = bb; bb = a;
      a = (t + S0 + maj) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  var out = new Array(32);
  for (var j = 0; j < 8; j++) {
    out[j * 4] = (H[j] >>> 24) & 255;
    out[j * 4 + 1] = (H[j] >>> 16) & 255;
    out[j * 4 + 2] = (H[j] >>> 8) & 255;
    out[j * 4 + 3] = H[j] & 255;
  }
  return out;
}

/** HMAC-SHA256(keyBytes, msgBytes) -> 32 bytes (RFC 2104, 64-byte block). */
function hmacSha256Bytes(keyBytes, msgBytes) {
  var key = keyBytes, i;
  if (key.length > 64) key = sha256Bytes(key);
  var ipad = new Array(64), opad = new Array(64);
  for (i = 0; i < 64; i++) {
    var kb = i < key.length ? key[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  var inner = sha256Bytes(ipad.concat(msgBytes));
  return sha256Bytes(opad.concat(inner));
}


const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_URL = "https://app.cloud-mb.xyz";
const TOKEN = "jdvhhjv255vghhgdhvfch2565656jhdcghfdf";
const PACKAGE_NAME = "com.movieblast";
const CERT_SIGNATURE = "308202e4308201cc020101300d06092a864886f70d010105050030373116301406035504030c0d416e64726f69642044656275673110300e060355040a0c07416e64726f6964310b30090603550406130255533020170d3234313231393135323335335a180f32303534313231323135323335335a30373116301406035504030c0d416e64726f69642044656275673110300e060355040a0c07416e64726f6964310b300906035504061302555330820122300d06092a864886f70d01010105000382010f003082010a0282010100be59a34bdaf2d2531e252aa5e2f08489302f661514c629c0f403c736b1f8910bbac353899d8c29d93e18841dd15799907d8136999bb751a29d657e5403364e10b86c9b5eaab4c86803f7df16c4749499e00e198e8f8dbe87c17ed5997c395edafa49d37b159baefecdc8e155386044f224ba2bfa3639efc4ac4a6387583825ee513c9ea594d4496cfb689a93363e70ad1c99f8a22e0a4e19fb70bcbebec9373e41a455e2e4aa0af8d2b896e4ff5cb38cee59b2c8be86271bea10b003a3a6740fd342fd99509727f2b9a1cbfae730f51548b9c7330c52530b4cc25a8bde4c6f52a77b2c26962bcd2dcc3feb5170abe269aec62e0183d1f3d072a9b4fe86bb763f0203010001300d06092a864886f70d010105050003820101003645510973db07823e9dcb9c057da7dda183c671a38ede1b608bc7917405bbd6e3f955d31dfe6eb22038c1818b83a7335e30606ddac331b5db29063c8d3c1e7ffd23ef752d1aaba28d3ce31a16e9ebb3e0a5529d7747fef6da79fc19c24676c1d812d209d2a2da3a8fa6a43d8c9a4cc1e1f5e0309d0e69376dec7aa5e0625be248409cee8626f89d67bd477baf5937c0362eef12491bb79e791cdde210ff9c7853d5ebdb3ef6e81904bc0604896295387513c68d39c091d0fb11de9049402a3cb0e7975c328fe8d34b9f6ecae2ca45f2dab3b09075bab1360977c3af37759168225892a62fbf64f8c28ced2664a65e61b6837ba0103e484a59b9c4715d759ee3";
const HMAC_SECRET = "GJ8reydarI7Jqat9rvbAJKNQ9gY4DoEQF2H5nfuI1gi";

const SEARCH_HEADERS = {
    "hash256": "86dc03244adddb3cbedbf0ae36074a736ee293a64774b18e82a6244eafd0df30",
    "packagename": PACKAGE_NAME,
    "signature": CERT_SIGNATURE,
    "User-Agent": "MovieBlast"
};

function resWeight(quality) {
  const q = (quality || "").toUpperCase();
  if (q === "4K" || q === "2160P") return 5;
  if (q === "1440P") return 4;
  if (q === "1080P") return 3;
  if (q === "720P") return 2;
  if (q === "480P") return 1;
  return 0;
}

function getInvertedSortTag(score, maxScore) {
  maxScore = maxScore || 999999;
  let val = Math.max(0, parseInt(score, 10) || 0);
  let inv = Math.max(0, maxScore - val);
  let bin = inv.toString(2);
  while (bin.length < 20) bin = "0" + bin;
  const chars = [];
  for (let i = 0; i < bin.length; i++) {
    chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
  }
  return chars.join("");
}

function httpsify(url) {
    return url && !url.startsWith("http") ? `https://${url}` : url;
}

function generateSignedUrl(url) {
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const timestamp = String(Math.floor(Date.now() / 1e3));
    const signature = bytesToB64(hmacSha256Bytes(utf8Bytes(HMAC_SECRET), utf8Bytes(path + timestamp)));
    return `${url}?verify=${timestamp}-${encodeURIComponent(signature)}`;
}

function matchQualityFromString(s) {
    if (!s) return "Unknown";
    const v = s.toLowerCase();
    if (v.includes("2160") || v.includes("4k")) return "2160p";
    if (v.includes("1440")) return "1440p";
    if (v.includes("1080") || v.includes("fullhd")) return "1080p";
    if (v.includes("720") || v.includes("hd")) return "720p";
    if (v.includes("480")) return "480p";
    if (v.includes("360")) return "360p";
    return "Unknown";
}

async function searchMedia(query) {
    const safeQuery = query.trim().replace(/ /g, "%20");
    const url = `${BASE_URL}/api/search/${safeQuery}/${TOKEN}`;
    const res = await fetch(url, { headers: SEARCH_HEADERS });
    const json = await res.json();
    const list = json && Array.isArray(json.search) ? json.search : [];
    return list.map((item) => {
        const isSeries = (item.type || "").toLowerCase().includes("serie");
        const path = isSeries ? "series/show" : "media/detail";
        return {
            name: item.name,
            isSeries,
            url: `${BASE_URL}/api/${path}/${item.id}/${TOKEN}`
        };
    });
}

async function loadDetail(url) {
    const res = await fetch(url);
    const json = await res.json();
    const seasons = Array.isArray(json.seasons) ? json.seasons : [];
    if (seasons.length > 0) {
        return { isSeries: true, seasons };
    }
    const videos = Array.isArray(json.videos) ? json.videos : [];
    return { isSeries: false, videos };
}

function extractLoadUrls(videos) {
    return (videos || []).map((v) => ({ link: v.link, server: v.server, lang: v.lang })).filter((v) => v.link);
}

function toStream(loadUrl) {
    if (!loadUrl.link) return null;
    const signed = generateSignedUrl(httpsify(loadUrl.link));
    const quality = matchQualityFromString(loadUrl.server);
    return {
        name: `MovieBlast \u2022 ${quality}`,
        title: `MovieBlast \u2022 ${quality}`,
        url: signed,
        quality,
        headers: {
            "Connection": "Keep-Alive",
            "Icy-MetaData": "1",
            "Referer": "MovieBlast",
            "User-Agent": "MovieBlast",
            "x-request-x": PACKAGE_NAME
        }
    };
}

function normalizeTitle(title) {
    return (title || "").toLowerCase()
        .replace(/\b(the|a|an)\b/g, "")
        .replace(/[:\-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function findBestMatch(title, results) {
    const normTarget = normalizeTitle(title);
    let best = null;
    let bestScore = 0;
    for (const r of results) {
        const norm = normalizeTitle(r.name);
        let score = 0;
        if (norm === normTarget) score = 1;
        else if (norm.includes(normTarget) || normTarget.includes(norm)) score = 0.8;
        else {
            const w1 = new Set(normTarget.split(" ").filter((w) => w.length > 2));
            const w2 = new Set(norm.split(" ").filter((w) => w.length > 2));
            const inter = [...w1].filter((w) => w2.has(w));
            score = w1.size ? inter.length / w1.size : 0;
        }
        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }
    return best;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === "tv" && (season == null || episode == null)) return [];

        const type = mediaType === "tv" ? "tv" : "movie";
        const tmdbRes = await fetch(`${TMDB_API_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const tmdbInfo = await tmdbRes.json();
        const title = tmdbInfo.title || tmdbInfo.name;
        if (!title) return [];

        const results = await searchMedia(title);
        if (results.length === 0) return [];

        const wantSeries = mediaType === "tv";
        const filtered = results.filter((r) => r.isSeries === wantSeries);
        const pool = filtered.length > 0 ? filtered : results;
        const match = findBestMatch(title, pool) || pool[0];
        if (!match) return [];

        const detail = await loadDetail(match.url);
        let videos = [];
        if (detail.isSeries) {
            if (!season || !episode) return [];
            const seasonObj = detail.seasons.find((s) => (s.season_number || 0) === Number(season));
            if (!seasonObj) return [];
            const episodes = Array.isArray(seasonObj.episodes) ? seasonObj.episodes : [];
            const episodeObj = episodes.find((e) => (e.episode_number || 0) === Number(episode));
            if (!episodeObj) return [];
            videos = Array.isArray(episodeObj.videos) ? episodeObj.videos : [];
        } else {
            videos = detail.videos;
        }

        const loadUrls = extractLoadUrls(videos);
        let streams = loadUrls.map(toStream).filter(Boolean).filter(s => resWeight(s.quality) >= 2);

        streams.sort((a, b) => resWeight(b.quality) - resWeight(a.quality));

        const total = streams.length;
        streams = streams.map((s, i) => {
            const tag = getInvertedSortTag(total - i, total + 1);
            return Object.assign({}, s, { name: tag + s.name, title: tag + s.title });
        });

        return streams;
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };