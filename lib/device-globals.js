// lib/device-globals.js - v1.2: supply the device-only globals that the Nuvio
// app runtime injects but plain Node does not.
//
// WHY THIS EXISTS (found by the v1.2 provider census, "providers doesnt show
// fetch"): several pack providers are written for the Nuvio QuickJS runtime,
// which auto-injects globals the app guarantees. On the addon server those
// globals do not exist, so the provider's own try/catch swallows a
// ReferenceError and the lane silently returns [] - exactly the "provider
// doesn't fetch" class:
//   - moviebox.js / anikototv.js / miruro.js / animotvslash.js / xpass.js
//     use bare `CryptoJS.*` (the app bundles crypto-js) - moviebox could not
//     even issue its search request, miruro/animotvslash lost their MegaPlay
//     AES lanes, anikototv lost its AES-CBC detail decrypt.
//   - anikototv.js reads bare `SCRAPER_SETTINGS.*` (app-injected settings).
//     torrents.js reads global.SCRAPER_SETTINGS for debrid provider/key.
//
// WHAT WE PROVIDE (zero-dependency, node:crypto only):
//   CryptoJS: WordArray (words/sigBytes), enc.{Utf8,Hex,Base64,Latin1},
//     MD5, HmacMD5, SHA256, HmacSHA256, HmacSHA1, AES.{encrypt,decrypt}
//     (CBC/ECB + Pkcs7/NoPadding via node crypto), lib.WordArray.create,
//     lib.CipherParams.create, mode.{CBC,ECB}, pad.{Pkcs7,NoPadding}.
//   SCRAPER_SETTINGS: {} by default, or JSON from SCRAPER_SETTINGS_JSON env -
//     e.g. SCRAPER_SETTINGS_JSON='{"debridProvider":"realdebrid","debridKey":"..."}'
//     turns the torrent lane into instant debrid links; {"uiTokens":"..."}
//     feeds showbox its token.
// Providers that bundle their own crypto (castle, showbox) keep using it -
// their local declaration shadows this global.

"use strict";

const nodeCrypto = require("crypto");

// ---- WordArray (CryptoJS-compatible shape: big-endian words + sigBytes) ----
function makeWordArray(buf, sigBytes) {
  const words = [];
  const len = Math.ceil(buf.length / 4);
  for (let i = 0; i < len; i++) {
    const b0 = buf[i * 4] || 0, b1 = buf[i * 4 + 1] || 0;
    const b2 = buf[i * 4 + 2] || 0, b3 = buf[i * 4 + 3] || 0;
    words.push(((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0);
  }
  const wa = {
    words,
    sigBytes: sigBytes != null ? sigBytes : buf.length,
    toString(fmt) {
      if (fmt && typeof fmt.stringify === "function") return fmt.stringify(this);
      // CryptoJS default is Hex
      return Buffer.from(buf).toString("hex");
    },
    // CryptoJS WordArray.concat(other) - appends other's bytes to this array
    concat(other) {
      const merged = Buffer.concat([Buffer.from(buf), toBuffer(other)]);
      const next = makeWordArray(merged);
      this.words = next.words;
      this.sigBytes = next.sigBytes;
      this.__buf = next.__buf;
      return this;
    },
    clone() {
      return makeWordArray(Buffer.from(buf), sigBytes);
    },
    clamp() { return this; }, // our words are always exact; clamp is a no-op
    __buf: buf,
  };
  return wa;
}

function toBuffer(msg) {
  if (msg == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(msg)) return msg;
  if (typeof msg === "string") return Buffer.from(msg, "utf8");
  if (Array.isArray(msg) || (msg && typeof msg.length === "number" &&
      typeof msg[0] === "number" && Array.isArray(msg.words) === false)) {
    // bare uint32 word list (CryptoJS passes arrays in some shims)
    const words = msg;
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i] >>> 0;
      out.push((w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
    }
    return Buffer.from(out);
  }
  if (msg && Array.isArray(msg.words)) {
    const bytes = [];
    const n = msg.sigBytes != null ? msg.sigBytes : msg.words.length * 4;
    for (let i = 0; i < msg.words.length && bytes.length < n; i++) {
      const w = msg.words[i] >>> 0;
      for (const b of [(w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff]) {
        if (bytes.length < n) bytes.push(b);
      }
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(String(msg), "utf8");
}

// ---- encoders ----
const encUtf8 = {
  stringify: (wa) => Buffer.from(toBuffer(wa)).toString("utf8"),
  parse: (s) => makeWordArray(Buffer.from(String(s), "utf8")),
};
const encHex = {
  stringify: (wa) => Buffer.from(toBuffer(wa)).toString("hex"),
  parse: (s) => makeWordArray(Buffer.from(String(s).replace(/[^0-9a-fA-F]/g, ""), "hex")),
};
const encBase64 = {
  stringify: (wa) => Buffer.from(toBuffer(wa)).toString("base64"),
  parse: (s) => {
    let b64 = String(s).replace(/-/g, "+").replace(/_/g, "/").trim();
    while (b64.length % 4) b64 += "=";
    return makeWordArray(Buffer.from(b64, "base64"));
  },
};
const encLatin1 = {
  stringify: (wa) => Buffer.from(toBuffer(wa)).toString("latin1"),
  parse: (s) => makeWordArray(Buffer.from(String(s), "latin1")),
};

// ---- hashes ----
function digestOf(algo, msg, key) {
  if (key == null) return nodeCrypto.createHash(algo).update(toBuffer(msg)).digest();
  return nodeCrypto.createHmac(algo, toBuffer(key)).update(toBuffer(msg)).digest();
}

// ---- AES (CBC / ECB, Pkcs7 default) ----
function aesKeyAndMode(key) {
  const kb = toBuffer(key);
  if (kb.length === 16) return ["aes-128", kb];
  if (kb.length === 24) return ["aes-192", kb];
  return ["aes-256", kb];
}
function cipherParamsFrom(ctWordArray) {
  return {
    ciphertext: ctWordArray,
    toString(fmt) {
      if (!fmt || fmt === encHex) return encHex.stringify(this.ciphertext);
      if (fmt === encBase64) return encBase64.stringify(this.ciphertext);
      return fmt.stringify ? fmt.stringify(this.ciphertext) : encHex.stringify(this.ciphertext);
    },
  };
}
function aesDecrypt(ciphertext, key, cfg) {
  const base = aesKeyAndMode(key);
  const useECB = cfg && cfg.mode && cfg.mode === exports.__markers.modeECB;
  const algo = base[0] + (useECB ? "-ecb" : "-cbc");
  const iv = useECB ? null : toBuffer(cfg && cfg.iv);
  const decipher = nodeCrypto.createDecipheriv(algo, base[1], iv);
  if (cfg && cfg.padding === exports.__markers.padNoPadding) decipher.setAutoPadding(false);
  // CryptoJS convention: a STRING ciphertext is Base64-encoded; a WordArray
  // (or {ciphertext}) holds raw bytes.
  let ct;
  if (typeof ciphertext === "string") ct = encBase64.parse(ciphertext).__buf;
  else if (ciphertext && ciphertext.ciphertext) ct = toBuffer(ciphertext.ciphertext);
  else ct = toBuffer(ciphertext);
  return makeWordArray(Buffer.concat([decipher.update(ct), decipher.final()]));
}
function aesEncrypt(plaintext, key, cfg) {
  const base = aesKeyAndMode(key);
  const useECB = cfg && cfg.mode && cfg.mode === exports.__markers.modeECB;
  const algo = base[0] + (useECB ? "-ecb" : "-cbc");
  const iv = useECB ? null : toBuffer(cfg && cfg.iv);
  const cipher = nodeCrypto.createCipheriv(algo, base[1], iv);
  if (cfg && cfg.padding === exports.__markers.padNoPadding) cipher.setAutoPadding(false);
  const pt = toBuffer(plaintext && plaintext.ciphertext ? plaintext.ciphertext : plaintext);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return cipherParamsFrom(makeWordArray(ct));
}

const CryptoJS = {
  lib: {
    WordArray: {
      create: (words, sigBytes) => {
        if (words && Array.isArray(words.words)) return makeWordArray(toBuffer(words), sigBytes != null ? sigBytes : words.sigBytes);
        return makeWordArray(toBuffer(words), sigBytes);
      },
    },
    CipherParams: { create: (cfg) => cipherParamsFrom(cfg && cfg.ciphertext) },
  },
  enc: { Utf8: encUtf8, Hex: encHex, Base64: encBase64, Latin1: encLatin1 },
  mode: null,   // filled below via markers
  pad: null,
  MD5: (msg) => makeWordArray(digestOf("md5", msg)),
  HmacMD5: (msg, key) => makeWordArray(digestOf("md5", msg, key)),
  SHA1: (msg) => makeWordArray(digestOf("sha1", msg)),
  HmacSHA1: (msg, key) => makeWordArray(digestOf("sha1", msg, key)),
  SHA256: (msg) => makeWordArray(digestOf("sha256", msg)),
  HmacSHA256: (msg, key) => makeWordArray(digestOf("sha256", msg, key)),
  SHA512: (msg) => makeWordArray(digestOf("sha512", msg)),
  HmacSHA512: (msg, key) => makeWordArray(digestOf("sha512", msg, key)),
  AES: { encrypt: aesEncrypt, decrypt: aesDecrypt },
};

// mode/pad are identity markers; aesEncrypt/Decrypt compare against them.
const markers = {
  modeCBC: { name: "CBC" },
  modeECB: { name: "ECB" },
  padPkcs7: { name: "Pkcs7" },
  padNoPadding: { name: "NoPadding" },
};
CryptoJS.mode = { CBC: markers.modeCBC, ECB: markers.modeECB };
CryptoJS.pad = { Pkcs7: markers.padPkcs7, NoPadding: markers.padNoPadding };
exports.__markers = markers;

function installDeviceGlobals() {
  if (typeof global.CryptoJS === "undefined") global.CryptoJS = CryptoJS;
  if (typeof global.SCRAPER_SETTINGS === "undefined") {
    let settings = {};
    if (process.env.SCRAPER_SETTINGS_JSON) {
      try {
        const parsed = JSON.parse(process.env.SCRAPER_SETTINGS_JSON);
        if (parsed && typeof parsed === "object") settings = parsed;
      } catch (e) {
        console.error("[device-globals] SCRAPER_SETTINGS_JSON is not valid JSON - using {}");
      }
    }
    global.SCRAPER_SETTINGS = settings;
    const keys = Object.keys(settings);
    console.log(`[device-globals] SCRAPER_SETTINGS injected${keys.length ? " (" + keys.join(",") + ")" : " (empty defaults)"}`);
  }
  if (typeof global.window === "undefined") {
    // providers guard their window access with typeof, but a couple of pack
    // files read window.SCRAPER_SETTINGS on a taken branch - give them the
    // same object so both branches agree.
    global.window = { SCRAPER_SETTINGS: global.SCRAPER_SETTINGS };
  }
}

module.exports = { installDeviceGlobals };
