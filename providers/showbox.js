"use strict";
// showbox.js - eclipsia pynvix.js source (codeberg eclipsia/nuvio-plugin v10.0.0), readable netmirror-style build for pack 4.43.0.
// Device fixes applied: lite, tdes.
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

/* ===== nv CryptoJS-lite: pure-JS TripleDES-CBC + Pkcs7 (pack 4.43.0) ========
   Device-safe replacement for pynvix/showbox's require("crypto-js") - the
   Nuvio realm ships no require() and no node modules. Implements exactly the
   surface pynvix.js uses: enc.Base64.parse, enc.Utf8.parse, mode.CBC,
   pad.Pkcs7 and TripleDES.decrypt(base64Cipher, keyWA, {iv, mode, padding}).
   Decrypt = DES-EDE3 (D k3 -> E k2 -> D k1) in CBC mode. Parity-tested in the
   sandbox against node:crypto (des-ede3-cbc) on the real key/iv + randoms.
========================================================================== */
var __nvCryptoJsLite = (function () {

  /* ---------- base64 / utf8 ---------- */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64ToBytes(s) {
    s = String(s || "").replace(/[^A-Za-z0-9+/=]/g, "");
    var out = [], i, acc = 0, bits = 0;
    for (i = 0; i < s.length; i++) {
      var c = B64.indexOf(s.charAt(i));
      if (c < 0 || c === 64) continue;
      acc = (acc << 6) | c;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return out;
  }
  function utf8ToBytes(str) {
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
  function bytesToUtf8(b) {
    var out = "", i = 0;
    while (i < b.length) {
      var x = b[i++];
      if (x < 0x80) out += String.fromCharCode(x);
      else if (x >= 0xc0 && x < 0xe0) out += String.fromCharCode(((x & 0x1f) << 6) | (b[i++] & 0x3f));
      else if (x >= 0xe0 && x < 0xf0) out += String.fromCharCode(((x & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
      else {
        var cp = ((x & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  /* ---------- DES tables (FIPS 45, 1-indexed as printed) ---------- */
  var PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,
             63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
  var PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,
             41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
  var SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  var IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,
            62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,
            57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,
            61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
  var FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,
            38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,
            36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,
            34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
  var E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,
           16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
  var P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,
           2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
  var SBOX = [
    [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
    [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
    [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
    [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
    [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
    [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
    [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
    [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
  ];

  function bytesToBits(bytes) {
    var bits = new Array(bytes.length * 8), i, j;
    for (i = 0; i < bytes.length; i++)
      for (j = 0; j < 8; j++)
        bits[i * 8 + j] = (bytes[i] >> (7 - j)) & 1;
    return bits;
  }
  function bitsToBytes(bits) {
    var out = [], i, j;
    for (i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      out.push(v & 0xff);
    }
    return out;
  }
  function permute(bits, table) {
    var out = new Array(table.length), i;
    for (i = 0; i < table.length; i++) out[i] = bits[table[i] - 1];
    return out;
  }
  function rotl28(v, n) { return ((v << n) | (v >>> (28 - n))) & 0x0fffffff; }

  function keySchedule(keyBytes8) {
    var kBits = permute(bytesToBits(keyBytes8), PC1);
    var c = 0, d = 0, i, j;
    for (i = 0; i < 28; i++) c = (c << 1) | kBits[i];
    for (i = 28; i < 56; i++) d = (d << 1) | kBits[i];
    var subkeys = [];
    for (var r = 0; r < 16; r++) {
      c = rotl28(c, SHIFTS[r]);
      d = rotl28(d, SHIFTS[r]);
      var cd = new Array(56);
      for (j = 0; j < 28; j++) cd[j] = (c >>> (27 - j)) & 1;
      for (j = 0; j < 28; j++) cd[28 + j] = (d >>> (27 - j)) & 1;
      subkeys.push(permute(cd, PC2));
    }
    return subkeys;
  }

  function feistel(rBits32, subkey48) {
    var exp = permute(rBits32, E), i;
    for (i = 0; i < 48; i++) exp[i] ^= subkey48[i];
    var sOut = new Array(32), p = 0;
    for (var box = 0; box < 8; box++) {
      var b6 = (exp[box * 6] << 5) | (exp[box * 6 + 1] << 4) | (exp[box * 6 + 2] << 3) |
               (exp[box * 6 + 3] << 2) | (exp[box * 6 + 4] << 1) | exp[box * 6 + 5];
      var row = ((b6 >> 5) & 1) * 2 + (b6 & 1);
      var col = (b6 >> 1) & 0x0f;
      var v = SBOX[box][row * 16 + col];
      for (i = 3; i >= 0; i--) sOut[p + i] = (v >> (3 - i)) & 1;
      p += 4;
    }
    return permute(sOut, P);
  }

  function desBlock(dataBytes8, subkeys, decrypt) {
    var bits = permute(bytesToBits(dataBytes8), IP), i, r;
    var L = bits.slice(0, 32), R = bits.slice(32, 64);
    for (r = 0; r < 16; r++) {
      var sk = decrypt ? subkeys[15 - r] : subkeys[r];
      var f = feistel(R, sk), newR = new Array(32);
      for (i = 0; i < 32; i++) newR[i] = L[i] ^ f[i];
      L = R;
      R = newR;
    }
    var pre = R.concat(L); /* final swap */
    return bitsToBytes(permute(pre, FP));
  }

  /* ---------- TripleDES-CBC ---------- */
  function xor8(a, b) {
    var out = new Array(8), i;
    for (i = 0; i < 8; i++) out[i] = a[i] ^ b[i];
    return out;
  }
  function tripleDesCbcDecrypt(key24, iv8, data) {
    var k1 = keySchedule(key24.slice(0, 8));
    var k2 = keySchedule(key24.slice(8, 16));
    var k3 = keySchedule(key24.slice(16, 24));
    var prev = iv8.slice(0, 8), out = [], off;
    for (off = 0; off + 8 <= data.length; off += 8) {
      var blk = data.slice(off, off + 8);
      var s1 = desBlock(blk, k3, true);   /* D(k3) */
      var s2 = desBlock(s1, k2, false);   /* E(k2) */
      var s3 = desBlock(s2, k1, true);    /* D(k1) */
      out = out.concat(xor8(s3, prev));
      prev = blk;
    }
    return out;
  }
  function pkcs7Unpad(bytes, blockSize) {
    if (!bytes.length) return bytes;
    var n = bytes[bytes.length - 1];
    if (n < 1 || n > blockSize || n > bytes.length) n = 0;
    if (n) bytes = bytes.slice(0, bytes.length - n);
    return bytes;
  }

  /* ---------- CryptoJS-compatible surface ---------- */
  function WA(bytes) {
    this.words = [];
    this.sigBytes = bytes.length;
    var i, j;
    for (i = 0; i < bytes.length; i += 4) {
      var w = 0;
      for (j = 0; j < 4; j++) w = w * 256 + (i + j < bytes.length ? bytes[i + j] : 0);
      this.words.push(w | 0);
    }
    this.__bytes = bytes;
  }
  WA.prototype.toString = function () { return bytesToUtf8(this.__bytes); };
  function waToBytes(wa) {
    if (wa && wa.__bytes) return wa.__bytes.slice(0, wa.sigBytes != null ? wa.sigBytes : wa.__bytes.length);
    return [];
  }

  return {
    enc: {
      Base64: { parse: function (s) { return new WA(b64ToBytes(s)); } },
      Utf8: { parse: function (s) { return new WA(utf8ToBytes(s)); } }
    },
    mode: { CBC: {} },
    pad: { Pkcs7: {} },
    TripleDES: {
      decrypt: function (cipherStr, keyWA, cfg) {
        var pt = tripleDesCbcDecrypt(waToBytes(keyWA), waToBytes(cfg && cfg.iv), b64ToBytes(String(cipherStr)));
        pt = pkcs7Unpad(pt, 8);
        return { toString: function () { return bytesToUtf8(pt); } };
      }
    }
  };
})();

var CryptoJS = __nvCryptoJsLite;
const DEFAULT_API_BASE = "https://id-mapping-api-showbox-proxy.hf.space/api/media";
const TMDB_BASE_URL    = "https://api.themoviedb.org/3";
const TMDB_KEY = "307b7b8ef035c6aa336900aef4e203bd"
const WORKING_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Accept":          "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type":    "application/json",
};

function parseRawToken(rawToken) {
  const t = String(rawToken).trim();
  if (!t) return "";
  if (t.startsWith("eyJ")) {
    try {
      const parsedWords   = CryptoJS.enc.Base64.parse(t);
      const decodedStr    = parsedWords.toString(CryptoJS.enc.Utf8);
      const parsed        = JSON.parse(decodedStr);
      if (parsed && parsed.encrypt_data) {
        const IV_KEY  = "wEiphTn!";
        const DES_KEY = "123d6cedf626dy54233aa1w6";
        const key     = CryptoJS.enc.Utf8.parse(DES_KEY);
        const iv      = CryptoJS.enc.Utf8.parse(IV_KEY);
        const decrypted = CryptoJS.TripleDES.decrypt(
          parsed.encrypt_data, key,
          { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        const decryptedJson = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        if (decryptedJson && decryptedJson.uid) return String(decryptedJson.uid);
      }
    } catch (e) {}
  }
  return t;
}

function getAllUiTokens() {
  try {
    const settings = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
    const raw = [];
    if (settings.uiToken)  raw.push(String(settings.uiToken));
    if (settings.uiTokens) raw.push(String(settings.uiTokens));

    const tokens = raw
      .join(",")
      .split(/[,\n]+/)
      .map(t => parseRawToken(t))
      .filter(Boolean);

    return [...new Set(tokens)];
  } catch {
    return [];
  }
}

function getEnabledQualities() {
  return new Set(["4K", "1080p", "Original"]);
}

function getQualityFromName(qualityStr) {
  if (!qualityStr) return "Unknown";
  const q = qualityStr.toUpperCase();
  if (q === "ORG"   || q === "ORIGINAL") return "Original";
  if (q === "4K"    || q === "2160P")    return "4K";
  if (q === "1440P" || q === "2K")       return "1440p";
  if (q === "1080P" || q === "FHD")      return "1080p";
  if (q === "720P"  || q === "HD")       return "720p";
  if (q === "480P"  || q === "SD")       return "480p";
  if (q === "360P")                      return "360p";
  if (q === "240P")                      return "240p";
  const match = qualityStr.match(/(\d{3,4})[pP]?/);
  if (match) {
    const res = parseInt(match[1], 10);
    if (res >= 2160) return "4K";
    if (res >= 1440) return "1440p";
    if (res >= 1080) return "1080p";
    if (res >= 720)  return "720p";
    if (res >= 480)  return "480p";
    if (res >= 360)  return "360p";
    return "240p";
  }
  return "Unknown";
}

function formatFileSize(sizeStr) {
  if (!sizeStr) return "Unknown";
  if (typeof sizeStr === "string" && /GB|MB|KB/.test(sizeStr)) return sizeStr;
  if (typeof sizeStr === "number") {
    const gb = sizeStr / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(sizeStr / (1024 * 1024)).toFixed(2)} MB`;
  }
  return String(sizeStr);
}

function getApiBase() {
  try {
    const settings = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
    if (settings.apiBase) return String(settings.apiBase);
  } catch { }
  return DEFAULT_API_BASE;
}

function validateIds(tmdbId, mediaType, seasonNum, episodeNum) {
  const idStr = String(tmdbId).trim();
  if (!/^\d+$/.test(idStr) || parseInt(idStr) <= 0) return false;
  if (mediaType === "tv") {
    if (seasonNum == null || episodeNum == null) return false;
    const ssn = parseInt(String(seasonNum).trim());
    const ep  = parseInt(String(episodeNum).trim());
    if (isNaN(ssn) || isNaN(ep) || ssn < 1 || ep < 1) return false;
  }
  return true;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  try {
    const res = await fetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}`);
    if (!res.ok) {
      return { title: `TMDB ID ${tmdbId}`, year: null };
    }
    const data = await res.json();
    const title       = mediaType === "tv" ? data.name : data.title;
    const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
    const year        = releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null;
    return { title, year };
  } catch {
    return { title: `TMDB ID ${tmdbId}`, year: null };
  }
}

async function fetchProxyWithTokenFallback(proxyUrl, tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      const response = await fetch(proxyUrl, {
        headers: Object.assign({}, WORKING_HEADERS, { "X-FebBox-Token": token }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, token };
      }

      if (response.status === 401 || response.status === 403 || response.status === 429) {
        continue;
      }

      return null;
    } catch {
      continue;
    }
  }
  return null;
}

async function extractFebBoxShare(showboxId, mediaType, seasonNum, episodeNum, uiToken, enabledQualities) {
  const streams = [];
  try {
    const boxType      = mediaType === "tv" ? 2 : 1;
    const sharePageUrl = `https://www.febbox.com/mbp/to_share_page?box_type=${boxType}&mid=${showboxId}&json=1`;

    const shareRes = await fetch(sharePageUrl).then(r => r.json()).catch(() => null);
    if (!shareRes || shareRes.code !== 1 || !shareRes.data) return [];

    const shareLink = shareRes.data.share_link || shareRes.data.shareLink;
    if (!shareLink) return [];

    const shareKey = new URL(shareLink).pathname.split("/").pop();
    if (!shareKey) return [];

    const listRes = await fetch(
      `https://www.febbox.com/file/file_share_list?share_key=${shareKey}`,
      { headers: { "Accept-Language": "en" } }
    ).then(r => r.json()).catch(() => null);
    if (!listRes || listRes.code !== 1 || !listRes.data || !listRes.data.file_list) return [];

    let fids = [];
    if (mediaType === "movie") {
      fids = listRes.data.file_list;
    } else {
      const seasonName   = `season ${seasonNum}`;
      const seasonFolder = listRes.data.file_list.find(
        f => f.file_name && f.file_name.toLowerCase() === seasonName
      );
      if (!seasonFolder) return [];

      const seasonListRes = await fetch(
        `https://www.febbox.com/file/file_share_list?share_key=${shareKey}&parent_id=${seasonFolder.fid}&page=1`,
        { headers: { "Accept-Language": "en" } }
      ).then(r => r.json()).catch(() => null);
      if (!seasonListRes || seasonListRes.code !== 1 || !seasonListRes.data || !seasonListRes.data.file_list) return [];

      const seasonSlug  = String(seasonNum).padStart(2, "0");
      const episodeSlug = String(episodeNum).padStart(2, "0");
      fids = seasonListRes.data.file_list.filter(f =>
        f.file_name && (
          f.file_name.toLowerCase().includes(`s${seasonSlug}e${episodeSlug}`) ||
          f.file_name.toLowerCase().includes(`s${seasonNum}e${episodeNum}`)
        )
      );
    }

    const videoHeaders = {
      "Accept":          "*/*",
      "Accept-Language": "en-US,en;q=0.8",
      "Connection":      "keep-alive",
      "Range":           "bytes=0-",
      "Referer":         "https://www.febbox.com/",
      "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    };
    const formattedCookie = uiToken.startsWith("ui=") ? uiToken : `ui=${uiToken}`;

    await Promise.all(fids.map(async (file) => {
      try {
        const qualityRes = await fetch(
          `https://www.febbox.com/console/video_quality_list?fid=${file.fid}&share_key=${shareKey}`,
          { headers: { "Cookie": formattedCookie } }
        ).then(r => r.json()).catch(() => null);
        if (!qualityRes || !qualityRes.html) return;

        const $ = cheerio.load(qualityRes.html);
        $("div.file_quality").each((_, el) => {
          const $quality     = $(el);
          const streamUrl    = $quality.attr("data-url");
          const qualityLabel = $quality.attr("data-quality");
          const sizeText     = $quality.find(".size").text().trim();
          if (!streamUrl) return;

          const normalizedQuality = getQualityFromName(qualityLabel);
          if (!enabledQualities.has(normalizedQuality)) return;

          streams.push({
            name:    `FebBox \u2022  ${normalizedQuality}`,
            title:    `FebBox \u2022  ${normalizedQuality}`,
            url:     streamUrl,
            quality: normalizedQuality,
            size:    sizeText || file.file_size || "Unknown",
            headers: videoHeaders,
          });
        });
      } catch {}
    }));
  } catch {}
  return streams;
}

function processShowBoxResponse(data, mediaInfo, mediaType, seasonNum, episodeNum, enabledQualities) {
  const streams = [];
  try {
    if (!data || data.success !== true) return streams;
    if (!Array.isArray(data.versions) || !data.versions.length) return streams;

    let streamTitle = mediaInfo.title || "Unknown Title";
    if (mediaInfo.year) streamTitle += ` (${mediaInfo.year})`;
    if (mediaType === "tv" && seasonNum && episodeNum) {
      streamTitle = `${mediaInfo.title || "Unknown"} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
      if (mediaInfo.year) streamTitle += ` (${mediaInfo.year})`;
    }

    data.versions.forEach((version, versionIndex) => {
      if (!Array.isArray(version.links)) return;
      version.links.forEach((link) => {
        if (!link.url) return;
        const normalizedQuality = getQualityFromName(link.quality || "Unknown");
        if (!enabledQualities.has(normalizedQuality)) return;

        let streamName = "ShowBox";
        if (data.versions.length > 1) streamName += ` V${versionIndex + 1}`;
        streamName += ` ${normalizedQuality}`;

        streams.push({
          name:    streamName,
          title:   streamTitle,
          url:     link.url,
          quality: normalizedQuality,
          size:    formatFileSize(link.size || version.size || "Unknown"),
          speed:   link.speed || null,
        });
      });
    });
  } catch {}
  return streams;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  if (!validateIds(tmdbId, mediaType, seasonNum, episodeNum)) return [];

  const tokens          = getAllUiTokens();
  const enabledQualities = getEnabledQualities();
  const apiBase         = getApiBase();

  if (!tokens.length) return [];

  try {
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);

    const proxyUrl = mediaType === "tv" && seasonNum && episodeNum
      ? `${apiBase}/tv/${tmdbId}/${seasonNum}/${episodeNum}`
      : `${apiBase}/movie/${tmdbId}`;

    const result = await fetchProxyWithTokenFallback(proxyUrl, tokens);
    if (!result) return [];

    const { data, token: activeToken } = result;

    let streams = processShowBoxResponse(data, mediaInfo, mediaType, seasonNum, episodeNum, enabledQualities);

    const showboxId = (data.id || data.mid) ||
      (data.data && (data.data.id || data.data.mid)) || null;

    if (showboxId) {
      const directStreams = await extractFebBoxShare(
        showboxId, mediaType, seasonNum, episodeNum, activeToken, enabledQualities
      );
      if (directStreams.length > 0) streams = streams.concat(directStreams);
    }

    if (!streams.length) return [];

    const seen = new Set();
    return streams.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
  } catch {
    return [];
  }
}

async function onSettings() {
  return [
    { type: "header", label: "ShowBox Configuration" },
    {
      type:        "text",
      isPassword:  true,
      key:         "uiToken",
      label:       "FebBox UI Token [Primary]",
      placeholder: "ui=...",
      description: "Copy your Febbox 'ui' cookie value",
    },
    {
      type:        "text",
      isPassword:  true,
      key:         "uiTokens",
      label:       "FebBox Additional UI Tokens [Optional]",
      placeholder: "ui=token2, ui=token3, ui=token4",
      description: "Separate with commas",
    },
  ];
}

module.exports = { getStreams, onSettings };