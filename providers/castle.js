"use strict";
// castle.js - eclipsia karnis.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: atob, qs, castle, utf8.
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

var __nvCastleCryptoJs = (function() {
  'use strict';
  /* AES tables */
  var SBOX = new Uint8Array(256),
    INV = new Uint8Array(256);
  (function() {
    var p = 1,
      q = 1,
      x;
    /* generate sbox via GF(2^8) inverse + affine transform */
    var mul = function(a, b) {
      var r = 0;
      while (b) {
        if (b & 1) r ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
      }
      return r;
    };
    SBOX[0] = 0x63;
    for (var i = 1; i < 256; i++) {
      var inv = 1,
        t = i;
      /* brute inverse */
      for (var j = 1; j < 256; j++) {
        if (mul(i, j) === 1) {
          inv = j;
          break;
        }
      }
      x = inv;
      var s = x;
      for (var k = 0; k < 4; k++) {
        s = ((s << 1) | (s >> 7)) & 0xff;
        x ^= s;
      }
      SBOX[i] = (x ^ 0x63) & 0xff;
    }
    for (var m = 0; m < 256; m++) INV[SBOX[m]] = m;
  })();
  var RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8];

  function keyExpansion(key) {
    var nk = key.length / 4,
      nr = nk + 6,
      w = [],
      i, t;
    for (i = 0; i < nk; i++) {
      w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }
    for (i = nk; i < 4 * (nr + 1); i++) {
      t = w[i - 1];
      if (i % nk === 0) {
        t = ((t << 8) | (t >>> 24)) >>> 0;
        t = ((SBOX[(t >>> 24) & 0xff] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) |
          (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff]) >>> 0;
        t = (t ^ (RCON[i / nk - 1] << 24)) >>> 0;
      } else if (nk > 6 && i % nk === 4) {
        t = ((SBOX[(t >>> 24) & 0xff] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) |
          (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff]) >>> 0;
      }
      w[i] = (w[i - nk] ^ t) >>> 0;
    }
    return {
      w: w,
      nr: nr
    };
  }

  function decryptBlock(ks, input) {
    var w = ks.w,
      nr = ks.nr;
    var s = [0, 0, 0, 0],
      i;
    for (i = 0; i < 4; i++) s[i] = (input[4 * i] << 24) | (input[4 * i + 1] << 16) | (input[4 * i + 2] <<
      8) | input[4 * i + 3];
    var m = function(x, y) {
      var r = 0;
      while (y) {
        if (y & 1) r ^= x;
        var hi = x & 0x80;
        x = (x << 1) & 0xff;
        if (hi) x ^= 0x1b;
        y >>= 1;
      }
      return r;
    };
    var ark = function(r) {
      for (var c = 0; c < 4; c++) s[c] = (s[c] ^ w[r * 4 + c]) >>> 0;
    };
    /* InvShiftRows + InvSubBytes: value at old (row,col) moves to (row,(col+row)%4) */
    var invShiftSub = function() {
      var st = new Uint8Array(16),
        o = new Uint8Array(16);
      for (var k = 0; k < 4; k++) {
        st[4 * k] = (s[k] >>> 24) & 0xff;
        st[4 * k + 1] = (s[k] >>> 16) & 0xff;
        st[4 * k + 2] = (s[k] >>> 8) & 0xff;
        st[4 * k + 3] = s[k] & 0xff;
      }
      for (var idx = 0; idx < 16; idx++) {
        var row = idx % 4,
          col = (idx - row) / 4;
        o[((col + row) % 4) * 4 + row] = INV[st[idx]];
      }
      for (var c2 = 0; c2 < 4; c2++) s[c2] = ((o[4 * c2] << 24) | (o[4 * c2 + 1] << 16) | (o[4 * c2 +
        2] << 8) | o[4 * c2 + 3]) >>> 0;
    };
    var invMix = function() {
      for (var c = 0; c < 4; c++) {
        var a0 = (s[c] >>> 24) & 0xff,
          a1 = (s[c] >>> 16) & 0xff,
          a2 = (s[c] >>> 8) & 0xff,
          a3 = s[c] & 0xff;
        var b0 = (m(a0, 14) ^ m(a1, 11) ^ m(a2, 13) ^ m(a3, 9)) & 0xff;
        var b1 = (m(a0, 9) ^ m(a1, 14) ^ m(a2, 11) ^ m(a3, 13)) & 0xff;
        var b2 = (m(a0, 13) ^ m(a1, 9) ^ m(a2, 14) ^ m(a3, 11)) & 0xff;
        var b3 = (m(a0, 11) ^ m(a1, 13) ^ m(a2, 9) ^ m(a3, 14)) & 0xff;
        s[c] = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
      }
    };
    /* FIPS-197 InvCipher: ARK(nr); for r=nr-1..1 { ISH,ISB,ARK(r),IMC }; ISH,ISB,ARK(0) */
    ark(nr);
    for (var r = nr - 1; r >= 1; r--) {
      invShiftSub();
      ark(r);
      invMix();
    }
    invShiftSub();
    ark(0);
    var out = new Uint8Array(16);
    for (i = 0; i < 4; i++) {
      out[4 * i] = (s[i] >>> 24) & 0xff;
      out[4 * i + 1] = (s[i] >>> 16) & 0xff;
      out[4 * i + 2] = (s[i] >>> 8) & 0xff;
      out[4 * i + 3] = s[i] & 0xff;
    }
    return out;
  }

  function cbcDecrypt(keyBytes, ivBytes, data) {
    var ks = keyExpansion(keyBytes);
    var out = new Uint8Array(data.length);
    var prev = new Uint8Array(ivBytes);
    for (var off = 0; off + 16 <= data.length; off += 16) {
      var blk = new Uint8Array(data.subarray(off, off + 16));
      var dec = decryptBlock(ks, blk);
      for (var i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
      prev = blk;
    }
    return out;
  }

  function pkcs7Unpad(b) {
    if (!b.length) return b;
    var n = b[b.length - 1];
    if (n < 1 || n > 16) return b;
    for (var i = b.length - n; i < b.length; i++)
      if (b[i] !== n) return b;
    return b.subarray(0, b.length - n);
  }

  /* --- CryptoJS-compatible WordArray --- */
  function WA(words, sigBytes) {
    this.words = words || [];
    this.sigBytes = sigBytes != null ? sigBytes : (this.words.length * 4);
  }
  WA.prototype.clamp = function() {
    if (this.sigBytes % 4) this.words[this.sigBytes >>> 2] &= (0xffffffff << (32 - (this.sigBytes % 4) *
      8)) >>> 0;
    this.words.length = Math.ceil(this.sigBytes / 4);
    return this;
  };
  WA.prototype.concat = function(wa2) {
    var tw = wa2.words,
      ts = wa2.sigBytes;
    this.clamp();
    if (ts % 4) {
      for (var i = 0; i < ts; i++) {
        var thatByte = (tw[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        this.words[(this.sigBytes + i) >>> 2] |= thatByte << (24 - ((this.sigBytes + i) % 4) * 8);
      }
    } else {
      for (var j = 0; j < ts / 4; j++) this.words[(this.sigBytes >>> 2) + j] = tw[j] | 0;
    }
    this.sigBytes += ts;
    return this;
  };

  function bytesToWords(b) {
    var w = [];
    for (var i = 0; i < b.length; i += 4) {
      w.push(((b[i] << 24) | ((b[i + 1] || 0) << 16) | ((b[i + 2] || 0) << 8) | (b[i + 3] || 0)) | 0);
    }
    return w;
  }

  function waToBytes(wa) {
    var out = new Uint8Array(wa.sigBytes);
    for (var i = 0; i < wa.sigBytes; i++) out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    return out;
  }

  function utf8ToBytes(s) {
    s = String(s);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
        var cp = ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00) + 0x10000;
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function bytesToUtf8(b) {
    var s = '';
    var i = 0;
    while (i < b.length) {
      var c = b[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if ((c & 0xe0) === 0xc0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
      else if ((c & 0xf0) === 0xe0) s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) |
        (b[i++] & 0x3f));
      else if ((c & 0xf8) === 0xf0) {
        var cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else s += String.fromCharCode(c);
    }
    return s;
  }

  function b64ToBytes(s) {
    var bin;
    if (typeof atob === 'function') bin = atob(s);
    else {
      var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      bin = '';
      var clean = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
      var bits = 0,
        acc = 0;
      for (var i = 0; i < clean.length; i++) {
        acc = (acc << 6) | CH.indexOf(clean.charAt(i));
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          bin += String.fromCharCode((acc >> bits) & 0xff);
        }
      }
    }
    var out = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k) & 0xff;
    return out;
  }

  var AES = {
    decrypt: function(cipher, key, cfg) {
      var ctBytes = (typeof cipher === 'string') ? b64ToBytes(cipher) :
        (cipher && cipher.ciphertext ? waToBytes(cipher.ciphertext) : new Uint8Array(0));
      var keyBytes = waToBytes(key);
      var ivBytes = (cfg && cfg.iv) ? waToBytes(cfg.iv) : new Uint8Array(16);
      var pt = pkcs7Unpad(cbcDecrypt(keyBytes, ivBytes, ctBytes));
      var w = bytesToWords(pt);
      return {
        sigBytes: pt.length,
        words: w,
        ciphertext: new WA(w.slice(), pt.length),
        toString: function() {
          return bytesToUtf8(pt);
        }
      };
    }
  };
  return {
    AES: AES,
    enc: {
      Base64: {
        parse: function(s) {
          var b = b64ToBytes(s);
          return new WA(bytesToWords(b), b.length);
        }
      },
      Utf8: {
        parse: function(s) {
          var b = utf8ToBytes(s);
          return new WA(bytesToWords(b), b.length);
        },
        stringify: function(wa) {
          return bytesToUtf8(waToBytes(wa));
        }
      }
    },
    lib: {
      WordArray: {
        create: function(words, sigBytes) {
          return new WA(words ? words.slice() : [], sigBytes != null ? sigBytes : (words ? words
            .length * 4 : 0));
        }
      }
    },
    mode: {
      CBC: {}
    },
    pad: {
      Pkcs7: {}
    }
  };
})();

var CryptoJS = __nvCastleCryptoJs;

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
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "307b7b8ef035c6aa336900aef4e203bd";
const BASE_API = "https://api.hlowb.com";
const PKG = 'com.external.castle';
const CHANNEL = '2';
const CLIENT = '1';
const LANG = 'en-US';
const API_HEADERS = {
  "User-Agent": "okhttp/4.11.0",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "Keep-Alive",
  "Referer": BASE_API,
};

const PLAYBACK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "video",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

const RESOLUTIONS = [3, 2];
const QUALITY_NAME_MAP = { "3": "1080p", "2": "720p", "1": "480p" };
const KARNIS_SUFFIX = "T!BgJB";
const ALLOWED_LANGS = new Set(["english", "hindi", "bangla", "bengali"]);

function isAllowedLang(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  for (const l of ALLOWED_LANGS) if (n.includes(l)) return true;
  return false;
}

async function makeRequest(url, options = {}) {
  if (typeof url !== "string" || !url.startsWith("https://"))
    throw new Error("Invalid URL: Only HTTPS is allowed");

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers ? { ...API_HEADERS, ...options.headers } : API_HEADERS,
    body: options.body,
  });

  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  return response;
}

async function extractCipherFromResponse(response) {
  const text = (await response.text()).trim();
  if (!text) throw new Error("Empty response");

  try {
    const json = JSON.parse(text);
    if (json?.data && typeof json.data === "string") return json.data.trim();
  } catch (_) { }

  return text;
}

function extractDataBlock(obj) {
  return (obj?.data && typeof obj.data === "object") ? obj.data : (obj || {});
}

function resolutionToQuality(resolution) {
  return QUALITY_NAME_MAP[String(resolution)] || `${resolution}p`;
}

function getQualityValue(quality) {
  if (!quality) return 0;
  const clean = quality.toString().toLowerCase()
    .replace(/^(sd|hd|fhd|uhd|4k)\s*/i, "")
    .replace(/p$/, "")
    .trim();
  const map = {
    "4k": 2160, "2160": 2160, "1440": 1440, "1080": 1080,
    "720": 720, "480": 480, "360": 360, "240": 240,
  };
  return map[clean] ?? (parseInt(clean) || 0);
}

function formatSize(sizeValue) {
  if (typeof sizeValue !== "number" || sizeValue <= 0) return "Unknown";
  return sizeValue > 1e9
    ? `${(sizeValue / 1e9).toFixed(2)} GB`
    : `${(sizeValue / 1e6).toFixed(0)} MB`;
}

async function decryptKarnis(encryptedB64, securityKeyB64) {

  if (typeof __crypto_aes_decrypt_raw !== "undefined") {
    const originalDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function (cipher, key, options) {
      try {
        const waToBytes = (wa) => {
          const bytes = new Uint8Array(wa.sigBytes);
          for (let i = 0; i < wa.sigBytes; i++)
            bytes[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
          return bytes;
        };

        const ciphertextBytes =
          typeof cipher === "string"
            ? new Uint8Array(Array.from(atob(cipher), c => c.charCodeAt(0)))
            : cipher.ciphertext
              ? waToBytes(cipher.ciphertext)
              : new Uint8Array(cipher);

        const kBytes = waToBytes(key);
        const ivBytes = options?.iv ? waToBytes(options.iv) : new Uint8Array(16);

        if (ivBytes.length !== 16)
          throw new Error(`Invalid IV length: ${ivBytes.length}`);

        const toArg = (u8) => typeof Int8Array !== "undefined"
          ? new Int8Array(u8.buffer) : u8;

        const resBytes = __crypto_aes_decrypt_raw(
          "AES-CBC", toArg(kBytes), toArg(ivBytes), toArg(ciphertextBytes)
        );
        const plain = nvUtf8Decode(resBytes);
        return { toString: () => plain };
      } catch (_) {
        return originalDecrypt.call(CryptoJS.AES, cipher, key, options);
      }
    };
  }

  const keyMaterial = CryptoJS.enc.Base64.parse(securityKeyB64)
    .concat(CryptoJS.enc.Utf8.parse(KARNIS_SUFFIX));

  let finalKey;
  if (keyMaterial.sigBytes < 16) {
    finalKey = keyMaterial.concat(
      CryptoJS.lib.WordArray.create(new Array(16 - keyMaterial.sigBytes).fill(0))
    );
  } else if (keyMaterial.sigBytes > 16) {
    finalKey = CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 4), 16);
  } else {
    finalKey = keyMaterial;
  }

  const decrypted = CryptoJS.AES.decrypt(encryptedB64, finalKey, {
    iv: finalKey,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) throw new Error("Decryption resulted in empty string");
  return result;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  const data = await (await makeRequest(url)).json();
  const title = mediaType === "tv" ? data.name : data.title;
  const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
  return { title, year: releaseDate ? parseInt(releaseDate) : null, tmdbId };
}

async function getSecurityKey() {
  const url = `${BASE_API}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`;
  const data = await (await makeRequest(url)).json();
  if (data.code !== 200 || !data.data)
    throw new Error(`Security key API error: ${JSON.stringify(data)}`);
  return data.data;
}

async function karnisRequest(url, options) {
  const cipher = await extractCipherFromResponse(await makeRequest(url, options));
  const decrypted = await decryptKarnis(cipher, options._securityKey);
  return JSON.parse(decrypted);
}

async function searchKarnis(securityKey, keyword, page = 1, size = 30) {
  const params = nvQs({
    channel: CHANNEL, clientType: CLIENT, keyword, lang: LANG,
    mode: "1", packageName: PKG, page: String(page), size: String(size),
  });
  return karnisRequest(
    `${BASE_API}/film-api/v2.1.2/movie/searchByKeyword?${params}`,
    { _securityKey: securityKey }
  );
}

async function getDetails(securityKey, movieId) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.1.2/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`,
    { _securityKey: securityKey }
  );
}

function buildVideoBody(base, extras) {
  return JSON.stringify({
    mode: "1", appMarket: "IndiaAGuanWang",
    clientType: CLIENT,
    woolUser: "false", apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
    androidVersion: "13", isNewUser: "true", packageName: PKG,
    ...base, ...extras,
  });
}

async function getVideoV1(securityKey, movieId, episodeId, languageId, resolution = 2) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.0.7/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildVideoBody(
        { movieId: String(movieId), episodeId: String(episodeId), resolution: String(resolution) },
        { languageId: String(languageId) }
      ),
      _securityKey: securityKey,
    }
  );
}

async function getVideo2(securityKey, movieId, episodeId, resolution = 2) {
  return karnisRequest(
    `${BASE_API}/film-api/v2.0.7/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildVideoBody({
        movieId: String(movieId), episodeId: String(episodeId), resolution: String(resolution),
      }, {}),
      _securityKey: securityKey,
    }
  );
}

async function findKarnisMovieId(securityKey, tmdbInfo) {
  const searchTerm = tmdbInfo.year ? `${tmdbInfo.title} ${tmdbInfo.year}` : tmdbInfo.title;
  const searchResult = await searchKarnis(securityKey, searchTerm);
  const rows = extractDataBlock(searchResult).rows || [];
  if (!rows.length) throw new Error("No search results found");

  const searchTitle = tmdbInfo.title.toLowerCase();
  const match = rows.find((item) => {
    const t = (item.title || item.name || "").toLowerCase();
    return t.includes(searchTitle) || searchTitle.includes(t);
  }) || rows[0];

  const id = match.id || match.redirectId || match.redirectIdStr;
  if (!id) throw new Error("Could not extract movie ID from search results");
  return id.toString();
}

function processVideoResponse(videoData, mediaInfo, seasonNum, episodeNum, resolution, languageInfo) {
  const data = extractDataBlock(videoData);
  const videoUrl = data.videoUrl;
  if (!videoUrl) return [];

  const subtitles = (data.subtitles || [])
    .filter((s) => s.url)
    .map((s) => ({
      url: s.url,
      language: s.abbreviate || "Unknown",
      name: s.title || s.abbreviate || "Unknown",
      headers: PLAYBACK_HEADERS,
    }));

  let mediaTitle = mediaInfo.title || "Unknown";
  if (seasonNum && episodeNum) {
    mediaTitle = `${mediaInfo.title} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
  } else if (mediaInfo.year) {
    mediaTitle += ` (${mediaInfo.year})`;
  }

  const quality = resolutionToQuality(resolution);

  const makeStream = (url, rawQuality, size) => {
    const q = (rawQuality || quality).replace(/^(SD|HD|FHD)\s+/i, "");
    if (getQualityValue(q) < 720) return null;
    return {
      name: `Castle${languageInfo ? ` • ${languageInfo}` : ""}${/preview/i.test(url) ? " (preview)" : ""}`,
      title: `Castle${languageInfo ? ` • ${languageInfo}` : ""}${/preview/i.test(url) ? " (preview)" : ""}`,
      url,
      quality: q,
      size: formatSize(size),
      headers: PLAYBACK_HEADERS,
      subtitles,
    };
  };

  if (data.videos?.length) {
    return data.videos
      .map((v) => makeStream(v.url || videoUrl, v.resolutionDescription || v.resolution, v.size))
      .filter(Boolean);
  }

  const s = makeStream(videoUrl, quality, data.size);
  return s ? [s] : [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === "tv" && (season == null || episode == null)) return [];

  try {
    const [tmdbInfo, securityKey] = await Promise.all([
      getTMDBDetails(tmdbId, mediaType),
      getSecurityKey(),
    ]);

    const rootMovieId = await findKarnisMovieId(securityKey, tmdbInfo);
    let currentMovieId = rootMovieId;

    if (mediaType === "tv" && season != null) {
      const rootData = extractDataBlock(await getDetails(securityKey, rootMovieId));
      const seasons = rootData.seasons || [];
      if (seasons.length > 1) {
        const seasonObj = seasons.find((s) => s.number === season);
        if (seasonObj?.movieId && seasonObj.movieId.toString() !== rootMovieId)
          currentMovieId = seasonObj.movieId.toString();
      }
    }

    const detailsData = extractDataBlock(await getDetails(securityKey, currentMovieId));
    const episodes = detailsData.episodes || [];

    const episodeObj = mediaType === "tv" && episode != null
      ? (episodes.find((e) => e.number === episode) ?? null)
      : (episodes[0] ?? null);

    if (!episodeObj?.id) throw new Error("Could not find episode");
    const episodeId = episodeObj.id.toString();

    const tracks = (episodeObj.tracks || []).filter((t) => isAllowedLang(t.languageName || t.abbreviate));
    const hasIndivVideo = tracks.some((t) => t?.existIndividualVideo === true);
    const allStreams = [];

    async function tryResolutions(fetchFn) {
      for (const res of RESOLUTIONS) {
        try {
          const streams = processVideoResponse(
            await fetchFn(res), tmdbInfo, season, episode, res, null
          );
          if (streams.length) { allStreams.push(...streams); return true; }
        } catch (_) { }
      }
      return false;
    }

    if (!hasIndivVideo) {
      await tryResolutions((res) => getVideo2(securityKey, currentMovieId, episodeId, res));
    } else {
      let loaded = false;
      for (const track of tracks) {
        if (!track || track.languageId == null) continue;
        const langName = track.languageName || track.abbreviate || "Unknown";
        for (const res of RESOLUTIONS) {
          try {
            const streams = processVideoResponse(
              await getVideoV1(securityKey, currentMovieId, episodeId, track.languageId, res),
              tmdbInfo, season, episode, res, langName
            );
            if (streams.length) { allStreams.push(...streams); loaded = true; }
          } catch (_) { }
        }
      }
      if (!loaded)
        await tryResolutions((res) => getVideo2(securityKey, currentMovieId, episodeId, res));
    }

    const withQv = allStreams.map((s) => [s, getQualityValue(s.quality)]);
    withQv.sort((a, b) => b[1] - a[1]);

    const seen = new Set();
    return withQv.map(([s]) => s).filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

  } catch (_) {
    return [];
  }
}

module.exports = { getStreams };