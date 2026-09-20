# nvio-stream-relay

A 2-minute Cloudflare Worker that gives the **NVio All Streams** addon a
different outbound IP, so scrapers that block Render's datacenter IP (and
still work inside the Nuvio app on your phone) start answering again.

## When you need this

Symptom: a scraper shows rows in the Nuvio app (nv-plugins pack) but always
0 rows in the addon logs, and the addon log shows connection errors / 403 /
"Just a moment" for that site. That is an IP block, not a code bug - no
scraper update can fix it. Give the addon the relay (free) or an HTTP proxy
(paid) and those lanes start working.

## Deploy (dashboard, no tools)

1. Cloudflare dashboard → **Workers & Pages → Create → Worker** → name it
   (e.g. `nvio-relay`) → **Deploy** → **Edit code**.
2. Paste the full contents of `worker.js` → **Deploy**.
3. (Recommended) **Settings → Variables → Add**: name `RELAY_KEY`, value =
   any long random string.
4. Copy your worker URL: `https://nvio-relay.<your-subdomain>.workers.dev`

## Point the addon at it (pick ONE)

**A. Render env (applies to the whole addon - recommended):**

| Key         | Value                                   |
|-------------|-----------------------------------------|
| `RELAY_URL` | `https://nvio-relay.your-subdomain.workers.dev` |
| `RELAY_KEY` | the same value you put in the worker's `RELAY_KEY` (omit if you did not set one) |

**B. Addon URL (per-addon-variant):**

```
https://<addon>.onrender.com/manifest.json?relay=https%3A%2F%2Fnvio-relay.your-subdomain.workers.dev%7C<RELAY_KEY>
```
(`%7C` is the encoded `|` that separates the URL from the key; the query
survives Nuvio's stream requests, same as the debrid-key URL form.)

## CLI deploy instead

```bash
npm i -g wrangler
wrangler secret put RELAY_KEY     # paste your key
wrangler deploy
```

## Verify

- Status page (`https://<addon>.onrender.com/`) → "egress: default relay → …"
- Open a title that used to be empty and check Render logs: blocked hosts now
  appear (rows) instead of connection errors. If the relay is down the addon
  automatically falls back to a direct attempt, so enabling it can never make
  things worse.

## Notes

- `api.themoviedb.org` and the addon's own host always stay direct (the TMDB
  backbone works from Render and is coalesced/cached).
- Upstream error statuses (403/503/…) pass through untouched - the relay only
  changes WHERE the request leaves from, never WHAT a site answers.
- Without `RELAY_KEY` set, anyone who discovers your workers.dev URL can use
  the relay; set the key.
