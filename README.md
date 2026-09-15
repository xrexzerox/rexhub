# NVio All Streams - one addon for NuvioTV, every scraper inside

Turns the whole **nv-plugins** scraper pack (40 direct/HLS sources) into a
single Stremio-protocol addon. NuvioTV (and phone Nuvio) talks to one URL;
a small Node service fans each stream request out to every scraper in
parallel and merges all rows into one response.

**v1.0.1 speed model** (fixes "slow when fetching streams"):

1. **Early exit** - the response returns as soon as 8+ rows have landed after
   a 4s floor, instead of waiting for the dozen always-slow scrapers to hit
   the 20s cap. Typical uncached answer: **4-8s** (was: always ~20s).
2. **Stream cache** - the same id/season/episode is answered **instantly**
   from an in-memory TTL cache (30 min). Nuvio re-asks the same id on the
   detail screen and when you press play.
3. **In-flight dedup** - simultaneous identical requests share one fan-out.
4. **Stale-while-revalidate** - an expired entry is served immediately while
   a background refresh updates it.
5. **Keep-warm** - on Render, the service self-pings `/healthz` every 14 min
   so the free tier never idles (kills the ~50s cold start). Disable with
   `KEEP_WARM=false`.

Every response also carries an `X-Cache` header: `miss` (fresh fan-out),
`hit` (from cache), `stale` (served old, refreshing), `dedup` (shared
fan-out), `badid`.

```
NuvioTV ──▶ /stream/movie/tmdb:969681.json
                 │
                 ├─ kisskh ─┐
                 ├─ pencuri ┤
                 ├─ vidfast ┼─▶ parallel (each capped 20s)
                 ├─ 4khdhub ┤
                 └─ ...38   ┘
                 ▼
        respond at 4-8s with whatever landed (or 20s hard max)
```

The scraper files in `providers/` are byte-for-byte the same JS the Nuvio app
runs in its QuickJS runtime (pack 4.43.1, device-killer-hardened). Node 18+
natively provides every global they use (`fetch`, `atob`, `URLSearchParams`,
`TextDecoder`, timers), so they run here unmodified.

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
| `PROVIDER_TIMEOUT_MS` | `20000` | Hard cap per scraper |
| `RESPONSE_DEADLINE_MS` | `20000` | Absolute max wait for one stream response |
| `EARLY_MIN_MS` | `4000` | Floor wait before an early response |
| `EARLY_ROWS` | `8` | Respond early once this many rows landed (`999` = old always-wait behavior) |
| `EARLY_DONE_PROVIDERS` | `25` | Also respond early once this many scrapers finished with ≥1 row |
| `STREAM_CACHE_TTL_MS` | `1800000` | Cache freshness window (30 min) |
| `CACHE_MAX` | `300` | Max cached ids (oldest evicted) |
| `MAX_ROWS` | `100` | Rows returned (deduped by URL, provider order) |
| `SKIP_PROVIDERS` | `torrents,tagalogtorrents` | Comma-separated ids to skip |
| `KEEP_WARM` | `true` | Self-ping `/healthz` every 14 min on Render (needs `RENDER_EXTERNAL_URL`) |
| `TMDB_API_KEY` | (bundled) | Used only to translate `tt…` IMDb ids to TMDB |
| `ADDON_NAME` / `ADDON_ID` / `ADDON_VERSION` | see server.js | Manifest identity |

## Notes & limits

- **Cold start:** handled by `KEEP_WARM` (default on): the service pings its
  own `/healthz` every 14 min so Render's free tier never idles. Turn it off
  if you'd rather save instance-hours and accept a ~50s first request.
- **Torrent lanes are excluded** (`torrents`, `tagalogtorrents`): their rows
  are magnet/infohash-based and cannot play over the addon HTTP protocol
  without a debrid service. They remain available in the plugin pack.
- **showbox** stays silent without its FebBox `uiToken` setting (by design).
- **Subtitles:** rows carry the `subtitles` arrays the scrapers emit
  (e.g. Pencuri's 4 English tracks) on a best-effort basis - clients that
  don't read addon subtitles simply ignore them.
- **Datacenter IPs:** some upstreams (kisskh mirrors, animotvslash) block
  datacenter IPs, so those lanes are quieter from Render than from your
  phone's ISP. That's upstream behavior, not a bug.
- **Logs:** every request logs per-scraper results -
  `[runner] pencuri: 2 rows in 2100ms`, `[runner] timeout kisskh >20000ms` -
  making slow or dead sources obvious at a glance.

## Local run

```bash
node server.js
# then: curl "http://localhost:10000/stream/movie/tmdb:969681.json"
```

## Updating the scrapers

Replace the files in `providers/` with the new pack versions (keep
`manifest.json` in sync), commit/push, and Render auto-deploys. Nothing in
`server.js` or `lib/runner.js` needs to change.
