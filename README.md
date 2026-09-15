# NVio All Streams - one addon for NuvioTV, every scraper inside

Turns the whole **nv-plugins** scraper pack (40 direct/HLS sources) into a
single Stremio-protocol addon. NuvioTV (and phone Nuvio) talks to one URL;
a small Node service fans each stream request out to every scraper in
parallel, waits up to `PROVIDER_TIMEOUT_MS`, and merges all rows into one
response.

```
NuvioTV ──▶ /stream/movie/tmdb:969681.json
                 │
                 ├─ kisskh ─┐
                 ├─ pencuri ┤
                 ├─ vidfast ┼─▶ parallel (each capped 20s)
                 ├─ 4khdhub ┤
                 └─ ...38   ┘
                 ▼
        { streams: [ ...merged, deduped... ] }
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
| `PROVIDER_TIMEOUT_MS` | `20000` | Hard cap per scraper; the response always answers within ~this time |
| `MAX_ROWS` | `100` | Rows returned (deduped by URL, provider order) |
| `SKIP_PROVIDERS` | `torrents,tagalogtorrents` | Comma-separated ids to skip |
| `TMDB_API_KEY` | (bundled) | Used only to translate `tt…` IMDb ids to TMDB |
| `ADDON_NAME` / `ADDON_ID` / `ADDON_VERSION` | see server.js | Manifest identity |

## Notes & limits

- **Cold start:** Render free tier spins the service down when idle; the first
  request after idle can take ~50s. Ping `/healthz` every 10-25 min
  (cron-job.org or UptimeRobot) to keep it warm.
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
