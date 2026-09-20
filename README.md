# NVio All Streams - one addon for NuvioTV, every scraper inside

Turns the whole **nv-plugins** scraper pack (42 sources - direct/HLS scrapers
**plus torrent lanes**) into a single Stremio-protocol addon. NuvioTV (and
phone Nuvio) talks to one URL; a small Node service fans each stream request
out to every scraper in parallel and merges all rows into one response.

**v1.5 - all scrapers work like nv-plugin** (egress control):

1. **Why some scrapers are empty here but work in the app:** the pack's
   scrapers run ON YOUR PHONE, so upstreams see your home IP and answer.
   The addon runs on Render, where a set of upstreams block datacenter IPs
   (kisskh mirrors, xpass, vidrock, apibay/1337x, miruro, cinemacity,
   moviebox API, ...). That is an IP-block, not a code bug - v1.5 lets the
   addon's scraper requests LEAVE from a different IP, closing the last
   structural gap between the addon and the on-device plugins.
2. **RELAY_URL - the free fix (recommended):** deploy the bundled 2-minute
   Cloudflare Worker relay (`addons/stream-relay/` - same deploy flow you
   already used for asian-catalog) and set `RELAY_URL` (+ optional
   `RELAY_KEY`) in Render's env. Scraper requests are then fetched from
   Cloudflare's egress. If the relay is down, the addon automatically falls
   back to a direct attempt - enabling it can never make things worse.
3. **PROXY_URL - the paid fix:** route every scraper request through any
   HTTP(S) proxy (`http://user:pass@host:port`), e.g. a residential proxy.
   The vendored `undici` ProxyAgent keeps full streaming Response
   transparency. Per-URL variants: add the addon as
   `.../manifest.json?relay=<enc(url%7Ckey)>` or `?proxy=<enc(url)>` -
   same idea as the debrid-key URL form; a relay/proxy variant gets its own
   `eg-…` config tag and addon id, and the stream cache is shared between
   direct and relay variants on purpose (same upstream, same rows).
4. **Safety model unchanged:** no provider file is touched and no global
   config is mutated - a request's egress rides the same per-request cfg as
   the debrid fields (AsyncLocalStorage), so concurrent requests with
   different configs cannot bleed. `api.themoviedb.org`, the addon's own
   host (keep-warm) and the relay host always stay direct; upstream error
   statuses (403/503/...) pass through untouched - the relay changes WHERE
   a request leaves from, never WHAT a site answers. All logs redact
   proxy/relay credentials.
5. **Fail-soft hardened:** an exception after headers were sent can no
   longer take the whole service down (v1.4-era crash class found in
   testing); such requests now just end cleanly.

**v1.4 - torrents that work** (fixes "torrents not working"):

1. **Debrid key in the addon URL** - the biggest change. Add the addon in
   NuvioTV with your debrid key baked into the URL, Torrentio-style:
   `https://<your-service>.onrender.com/realdebrid=YOURKEY/manifest.json`
   or `https://<your-service>.onrender.com/manifest.json?debrid=realdebrid&key=YOURKEY`.
   NuvioTV appends `/stream/...` to the manifest URL, so the key rides on
   every request and the Torrentio lane answers with **instant cached http
   links** - torrent rows that just play, no debrid setup inside the app,
   no Render env vars. Supported providers: realdebrid, alldebrid,
   premiumize, debridlink, easydebrid, offcloud, torbox, putio, seedr,
   pikpak. Changed the key? Remove + re-add the addon (or just change the
   URL) - requests are cached per config, so the old magnet variant stays
   untouched. If both URL forms are present the query parameter wins.
2. **Debrid fallback to magnets** - if the debrid-prefixed Torrentio route
   fails or comes back empty (invalid/expired key, nothing cached in your
   debrid cloud), the lane now also fetches the plain route so you still get
   magnet rows instead of a silent hole.
3. **The silent-0-rows bug is fixed** - under a cold TMDB burst the lane's
   metadata lookup could lose its 5s race, and the lane then silently
   queried Torrentio with the numeric TMDB id as an IMDb id: zero torrent
   rows that stuck in the cache for 30 minutes. It now retries the lookup
   once (the other scrapers have usually warmed the coalescing cache by
   then), never invents an IMDb id, and any aggregate whose torrent lanes
   came back empty is cached only 5 minutes (`TORRENT_MISS_TTL_MS`) and
   re-scanned synchronously on the next open.
4. **Upstream resilience + honest logs** - per-backend retry (one retry 700ms
   after a failure), fetch timeout 6s → 8s, and failures are now LOGGED:
   `[Torrents] Torrentio HTTP 429` / `fetch failed: ...` / `debrid route
   empty/failed - fetching plain Torrentio magnets as fallback` / `[runner]
   torrents: 0 rows (lane empty)`. No more silent failures to guess at.
5. **Diagnosability** - every `/stream` response carries `X-Rows` and
   `X-Torrent-Rows` headers (plus `X-Cache: <state>:<config>`), so one curl
   tells you whether torrent rows are actually in the payload.
6. Optional mirror/test knobs: `TORRENTIO_API_BASE`, `TORRENTSDB_API_BASE`
   override the two torrent backends' base URLs.

**v1.3 - empty-cache hardening** (fixes "scrapers not giving streams"):

1. **Zero-row aggregates are cached only 90s** (`ZERO_ROW_TTL_MS`) instead
   of the full 30 minutes, an expired empty entry is re-fanned-out
   synchronously (never served stale), and a background refresh that lands
   0 rows can no longer clobber a good entry. One bad fan-out (deploy
   restart, cold TMDB, upstream flap) no longer poisons a title for half
   an hour - exactly the reported "not giving streams that never recovers".

**v1.2 - torrents + provider fixes** (fixes "providers doesn't show fetch"):

1. **Torrent lanes ON** - `torrents` (Torrentio + TorrentsDB) and
   `tagalogtorrents` now run in the addon. Their rows are emitted as
   `magnet:` urls plus the standard Stremio torrent fields (`infoHash`,
   `fileIdx`, `sources`, `behaviorHints.notWebReady`), so Nuvio resolves them
   with its own debrid account or built-in P2P engine. Same pack rules as
   always: seeders >= 5, 720p/1080p only. To go back to direct/HLS-only set
   `SKIP_PROVIDERS=torrents,tagalogtorrents`.
2. **Device-globals shim** (`lib/device-globals.js`) - several scrapers are
   written for the app runtime, which auto-injects `CryptoJS` and
   `SCRAPER_SETTINGS`. On the server those were missing, so the provider's
   own try/catch swallowed the ReferenceError and the lane silently returned
   zero rows ("doesn't show fetch"). The shim supplies both globals, which
   brings back: **anikototv** (verified 4 rows), **castle** (AES-CBC detail
   decrypt; verified live), **moviebox**'s request signing, **miruro /
   animotvslash** MegaPlay AES lanes and **xpass**'s crypto fallback.
3. **vegamovies last-mile fix** - the embedded HTML parser strips `<script>`
   bodies, but the vcloud/hubcloud "bridge" url lives inside a script tag
   (`var url = atob(atob('...'))`). The parser now also keeps the raw source,
   so the bridge is found again (verified: direct 1080p rows).
4. **movieshunt re-plumbed** - the site moved to movieshunt.monster and made
   search client-side rendered, and hubcloud rotated domains (.cx -> .ist).
   The provider now calls the site's own JSON lookup endpoint first
   (`/lookup.php?q=...`) and accepts any hubcloud TLD (verified: 3x 1080p).
5. Optional **SCRAPER_SETTINGS_JSON** env var feeds providers their gear-icon
   settings server-side - e.g. `{"debridProvider":"realdebrid","debridKey":"..."}`
   turns the torrent lane into instant cached http links, or
   `{"uiTokens":"..."}` enables showbox.

**v1.1 speed model** (fixes "slow when fetching streams"):

1. **Early exit** - the response returns as soon as 6+ rows have landed after
   a 4s floor (or 20+ scrapers finished with at least one row), instead of
   waiting for the dozen always-slow scrapers to hit the cap. Typical
   uncached answer: **4-6s** (was: always ~20s in v1.0.0).
2. **Mid checkpoint** - a sparse title that found 1+ row but few finished
   scrapers no longer sits on the deadline: at ~9s it answers with whatever
   it has (worst case 15s, down from 20s).
3. **Stream cache** - the same id/season/episode is answered **instantly**
   from an in-memory TTL cache (30 min). Nuvio re-asks the same id on the
   detail screen and when you press play.
4. **In-flight dedup** - simultaneous identical requests share one fan-out.
5. **Stale-while-revalidate** - an expired entry is served immediately while
   a background refresh updates it.
6. **Full cache completion** - rows that land *after* the early answer used
   to be thrown away. Now a background pass folds them into the cache entry:
   re-opening the same title returns the complete set instantly (watch for
   the `[runner] FULL ...` log line).
7. **TMDB coalescing** - every scraper resolves its own TMDB metadata, so one
   fan-out used to fire ~35 identical `api.themoviedb.org` calls at once.
   A transparent fetch shim collapses them into one round trip and caches
   responses for 10 min (`TMDB_CACHE_TTL_MS`).
8. **Keep-warm** - on Render, the service self-pings `/healthz` every 14 min
   so the free tier never idles (kills the ~50s cold start). Disable with
   `KEEP_WARM=false`.

Every response also carries an `X-Cache` header (`miss`/`hit`/`stale`/
`dedup`/`badid`, suffixed with the active config tag), plus `X-Rows` and
`X-Torrent-Rows` - e.g. `curl -sI
'https://<service>.onrender.com/stream/movie/969681.json' | grep -i x-`
instantly shows whether torrent rows are in the payload.

```
NuvioTV ──▶ /stream/movie/tmdb:969681.json
                 │
                 ├─ kisskh ─┐
                 ├─ pencuri ┤
                 ├─ vidfast ┼─▶ parallel (each capped 15s)
                 ├─ 4khdhub ┤
                 └─ ...38   ┘
                 ▼
     respond at 4-6s with whatever landed · 9s sparse checkpoint · 15s max
```

The scraper files in `providers/` are byte-for-byte the same JS the Nuvio app
runs in its QuickJS runtime (pack 4.44.0, device-killer-hardened; since
1.2.0-1.4.0 the addon-side fixes for `vegamovies`, `movieshunt` and
`torrents` were folded BACK into the pack, so both artifacts share identical
provider code again). Node 18+ natively provides every global they use
(`fetch`, `atob`, `URLSearchParams`, `TextDecoder`, timers), so they run here
unmodified.

## Deploy on Render (free)

**Option A - Blueprint (recommended):** push this folder to a GitHub repo,
then Render dashboard → **New + → Blueprint** → pick the repo → **Apply**.
`render.yaml` does the rest.

**Option B - Manual:** Render → **New + → Web Service** → connect the repo →
Runtime **Node**, Build `true`, Start `node server.js`, Plan Free → Create.

Render gives you `https://<service-name>.onrender.com` and injects
`RENDER_EXTERNAL_URL` automatically.

## Add it to Nuvio / NuvioTV

1. Open NuvioTV → **Settings → Addons → Add Addon** (URL field).
2. Paste: `https://<your-service>.onrender.com/manifest.json`
3. Confirm. From now on every movie/series detail screen also shows the
   aggregated rows from all 40 scrapers, alongside your existing plugins.

Your existing **plugins keep working unchanged** - this addon is additive.
Remove + re-add the addon after redeploying the service with changes.

## Environment variables (all optional)

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `10000` | Listen port (Render sets it automatically) |
| `PROVIDER_TIMEOUT_MS` | `15000` | Hard cap per scraper (v1.1: was 20000) |
| `RESPONSE_DEADLINE_MS` | `15000` | Absolute max wait for one stream response |
| `EARLY_MIN_MS` | `4000` | Floor wait before an early response |
| `EARLY_ROWS` | `6` | Respond early once this many rows landed (`999` = old always-wait behavior) |
| `EARLY_DONE_PROVIDERS` | `20` | Also respond early once this many scrapers finished with ≥1 row |
| `MID_MIN_MS` | `9000` | Second checkpoint: sparse titles answer here once ≥1 row exists |
| `STREAM_CACHE_TTL_MS` | `1800000` | Cache freshness window for results with rows (30 min) |
| `ZERO_ROW_TTL_MS` | `90000` | v1.3: empty results cached only 90s - the next open re-tries all scrapers instead of replaying the empty answer |
| `TORRENT_MISS_TTL_MS` | `300000` | v1.4: an aggregate whose torrent lanes returned 0 rows is cached only 5 min and re-scanned synchronously on the next open |
| `TORRENTIO_API_BASE` / `TORRENTSDB_API_BASE` | *(bundled)* | v1.4: override the torrent backends' base URLs (mirror / testing) |
| `CACHE_MAX` | `300` | Max cached ids (oldest evicted) |
| `MAX_ROWS` | `100` | Rows returned (deduped, provider order; torrents deduped by infoHash) |
| `SKIP_PROVIDERS` | *(empty)* | v1.2: torrent lanes ON by default; set `torrents,tagalogtorrents` for direct/HLS-only |
| `SCRAPER_SETTINGS_JSON` | *(empty)* | v1.2: provider settings as JSON (debrid provider/key for the torrent lane, showbox `uiTokens`, ...) |
| `RELAY_URL` / `RELAY_KEY` | *(empty)* | v1.5: fetch scraper requests through your self-hosted Cloudflare relay (see `addons/stream-relay/`) - unblocks lanes that block Render's datacenter IP |
| `PROXY_URL` | *(empty)* | v1.5: route every scraper request through an HTTP(S) proxy (`http://user:pass@host:port`) via the vendored undici ProxyAgent |
| `KEEP_WARM` | `true` | Self-ping `/healthz` every 14 min on Render (needs `RENDER_EXTERNAL_URL`) |
| `TMDB_API_KEY` | (bundled) | Used only to translate `tt…` IMDb ids to TMDB |
| `TMDB_CACHE_TTL_MS` | `600000` | v1.1: coalesced TMDB metadata cache window (10 min) |
| `TMDB_CACHE_MAX` | `500` | v1.1: max cached TMDB responses (oldest evicted) |
| `ADDON_NAME` / `ADDON_ID` / `ADDON_VERSION` | see server.js | Manifest identity |

## Notes & limits

- **Cold start:** handled by `KEEP_WARM` (default on): the service pings its
  own `/healthz` every 14 min so Render's free tier never idles. Turn it off
  if you'd rather save instance-hours and accept a ~50s first request.
- **Torrent lanes are ON** (`torrents`, `tagalogtorrents`): rows are
  magnet/infoHash-based. Nuvio plays them via your debrid account (configure
  it in Nuvio settings) or its P2P engine; with `SCRAPER_SETTINGS_JSON`
  debrid keys the addon itself returns instant cached http links instead.
  Torrentio/TorrentsDB apply the pack's standing rules: seeders >= 5,
  720p/1080p only.
- **showbox** stays silent without its FebBox `uiToken` setting - provide it
  via `SCRAPER_SETTINGS_JSON` (by design, it is a per-user token).
- **Subtitles:** rows carry the `subtitles` arrays the scrapers emit
  (e.g. Pencuri's 4 English tracks) on a best-effort basis - clients that
  don't read addon subtitles simply ignore them.
- **Datacenter IPs:** some upstreams block datacenter IPs, so those lanes are
  quieter from Render than from your phone's ISP (kisskh mirrors, moviebox /
  aoneroom API, xpass embed, vidrock API, fibwatch, apibay/1337x for
  tagalogtorrents, miruro's own pipe, cinemacity). That's upstream bot
  protection, not a bug - and since **v1.5 it is fixable**: set `RELAY_URL`
  (free Cloudflare relay, `addons/stream-relay/`) or `PROXY_URL` and those
  lanes leave from a non-Render IP. ctgmovies' host and cinejoy's API were
  down at the v1.2 release; 4khdhub moved its download buttons behind an
  obfuscated ad-redirector chain, so it currently only serves titles whose
  pages still embed direct hubcloud links. Since then
  `api.speedracelight.com` (the shared metadata API behind
  videasy/vidking/vidlove) went 502 and `vidrock.net` started
  Cloudflare-challenging non-browser clients - both upstream-side.
- **Logs:** every request logs per-scraper results -
  `[runner] pencuri: 2 rows in 2100ms`, `[runner] timeout kisskh >15000ms
  (rows dropped)` (only scrapers that genuinely hit the cap log this),
  `[runner] FULL movie 123: 20 rows (respond had 8)` (late rows folded into
  the cache - re-open the title to get them) -
  making slow or dead sources obvious at a glance.

## Troubleshooting: "no streams / scrapers not showing"

1. **Check the service is alive:** open `https://<your-service>.onrender.com/`
   - it must show the status page with v1.5.0 and 42 scrapers loaded, no
     load errors, and an `egress:` line (direct / relay / proxy). If Render
     shows a failed deploy, push the unzipped folder
     again (`git add -A` so `lib/device-globals.js`, `lib/egress.js`,
     `node_modules/undici/` and `providers/torrents.js` /
     `providers/tagalogtorrents.js` are included)
     and watch the deploy log end with `live`.
2. **Open the title twice.** Since v1.3 an empty answer is only remembered
   for 90 seconds; since v1.4 an answer missing its torrent rows is
   remembered for only 5 minutes AND the next open re-scans synchronously.
3. **Torrent rows: the two-minute setup that makes them PLAY.** Without a
   resolver, NuvioTV hides magnet/infoHash rows (nothing on the device can
   fetch a torrent). The fix is one URL - add the addon as
   `https://<your-service>.onrender.com/realdebrid=YOURKEY/manifest.json`
   (Real-Debrid etc. - see the v1.4 list above). The torrent lane then
   returns instant http links from your debrid cloud's cache. Alternatives:
   configure debrid inside Nuvio's own settings (resolves magnets on the
   device), or rely on the TV's P2P engine where available. No debrid
   account? Magnet rows still appear for direct-capable clients - and the
   debrid-less `SCRAPER_SETTINGS_JSON` route from v1.2 keeps working.
4. **One-curl payload check:**
   `curl -sI 'https://<service>/stream/movie/969681.json' | grep -i x-`
   - `X-Torrent-Rows: 0` means the torrent lanes found nothing (upstream
   rate-limit/blocked window - open the title again, and check the Render
   logs for the now-explicit `[Torrents] ...` failure lines).
5. **Confirm which lanes are alive right now:** the addon logs one line per
   scraper per request (`[runner] <id>: N rows in Xms`), torrent backends
   log their HTTP failures (`[Torrents] Torrentio HTTP 429`), and a
   torrent lane that ends with zero rows says so (`[runner] torrents: 0
   rows (lane empty)`). Several upstreams are simply down or bot-walled
   for datacenter IPs (see Notes & limits); that changes week to week
   without any addon change.
6. **"Works in the Nuvio app, empty in the addon" = IP block → v1.5 egress.**
   Deploy the relay (`addons/stream-relay/README.md`, 2 minutes) and set
   `RELAY_URL` in Render's env, or set `PROXY_URL`. Watch the status page's
   egress line flip from `direct` to `relay`/`proxy`, then re-open the dead
   title. Relay failures log as `[egress] relay … - direct fallback`, so a
   misconfigured relay degrades to today's behavior, never to zero.

## Local run

```bash
node server.js
# then: curl "http://localhost:10000/stream/movie/tmdb:969681.json"
```

## Updating the scrapers

Replace the files in `providers/` with the new pack versions (keep
`manifest.json` in sync), commit/push, and Render auto-deploys. Nothing in
`server.js` or `lib/runner.js` needs to change.
