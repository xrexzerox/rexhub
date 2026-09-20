// nvio-stream-relay - Cloudflare Worker that relays the addon's scraper
// requests through Cloudflare's egress instead of Render's datacenter IP.
//
// WHY: many sites that the nv-plugins pack can reach from a phone's home
// connection block datacenter IPs (Render included). Deploying this worker
// and pointing the addon's RELAY_URL at it lets those scrapers fetch from
// Cloudflare's network - the exact "works in the app, empty in the addon"
// class. It is a pass-through pipe: it adds no caching, no rewriting, no
// logging beyond Cloudflare's standard metrics.
//
// PROTOCOL (spoken by the addon's lib/egress.js, v1.5+):
//   GET /?u=<target url>
//       &h=<base64url(JSON of request headers)>      (optional)
//       &m=<METHOD>                                  (optional, default GET)
//       &b=<base64url(request body)>                 (optional, non-GET)
//       &k=<RELAY_KEY>                               (optional shared secret)
// The upstream's status + headers + body are streamed straight back. The
// worker's OWN errors (bad key / missing params) are marked with the
// x-relay-error header so the addon can fall back to a direct fetch; real
// upstream answers (403, 503, ...) pass through untouched.
//
// DEPLOY (2 minutes):
//   1. dash:  Workers & Pages -> Create -> paste this file -> Deploy
//             (optional: Settings -> Variables -> add RELAY_KEY)
//      or cli:  npm i -g wrangler && wrangler secret put RELAY_KEY
//               && wrangler deploy
//   2. Render env on the addon service:
//        RELAY_URL = https://<your-worker>.workers.dev
//        RELAY_KEY = <same value as the worker's RELAY_KEY>   (if set)
//      or add the addon as
//        https://<addon>.onrender.com/manifest.json?relay=https%3A%2F%2F<your-worker>.workers.dev%7C<RELAY_KEY>
//
// SECURITY: set RELAY_KEY. Without it, anyone who learns the workers.dev URL
// can use this worker as an open HTTP relay (rate-limited only by Cloudflare).

const BLOCKED_REQUEST_HEADERS = new Set([
  "host", "content-length", "connection", "keep-alive",
  "transfer-encoding", "upgrade",
]);

function b64urlToBytes(s) {
  let b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function relayError(status, msg) {
  return new Response(msg + "\n", {
    status,
    headers: {
      "x-relay-error": "1",
      "access-control-allow-origin": "*",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
    }

    const url = new URL(request.url);

    // shared secret (optional but recommended)
    if (env && env.RELAY_KEY) {
      const k = url.searchParams.get("k") || "";
      if (k !== env.RELAY_KEY) return relayError(403, "relay: bad key");
    }

    const target = url.searchParams.get("u");
    if (!target || !/^https?:\/\//i.test(target)) {
      return relayError(400, "relay: missing ?u=<http(s) url>");
    }
    let targetUrl;
    try { targetUrl = new URL(target); } catch (_) {
      return relayError(400, "relay: bad ?u=");
    }

    let headers = {};
    const hb = url.searchParams.get("h");
    if (hb) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(hb)));
        for (const [k, v] of Object.entries(parsed)) {
          if (!BLOCKED_REQUEST_HEADERS.has(String(k).toLowerCase())) headers[k] = String(v);
        }
      } catch (_) { /* ignore a malformed header blob - fetch with defaults */ }
    }
    // a plain default UA helps when the caller sends none (some sites 403
    // the worker's own user-agent)
    if (!headers["user-agent"]) {
      headers["user-agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36";
    }

    const method = (url.searchParams.get("m") || "GET").toUpperCase();
    if (!/^[A-Z]+$/.test(method) || method === "CONNECT" || method === "TRACE") {
      return relayError(400, "relay: bad method");
    }

    let body;
    if (method !== "GET" && method !== "HEAD") {
      const bb = url.searchParams.get("b");
      if (bb != null) body = b64urlToBytes(bb);
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method,
        headers,
        body,
        redirect: "follow",
      });
    } catch (e) {
      return relayError(502, "relay: upstream fetch failed: " + (e && e.message));
    }

    const outHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk === "content-encoding" || lk === "content-length" ||
          lk === "transfer-encoding" || lk === "connection") return;
      outHeaders.set(k, v);
    });
    outHeaders.set("access-control-allow-origin", "*");

    return new Response(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};
