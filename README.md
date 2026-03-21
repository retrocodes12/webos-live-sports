# sportzx

`sportzx` is a `webOS`-ready live sports app shell for authorized feeds. It ships with:

- a TV-first home dashboard
- remote-friendly keyboard navigation
- live match browsing and stream selection
- a browser player with direct `HLS` playback through `hls.js`
- support for authorized embedded player pages
- a backend-ready catalog service for your real rights-cleared streams

## Run locally

```bash
npm install
npm run dev:api
npm run dev
```

Use the frontend with:

```bash
cp .env.example .env.local
```

The default example points the app at the local API server on `http://127.0.0.1:8787`.

## Build

```bash
npm run build
```

## Prepare a webOS package directory

```bash
npm run prepare:webos
```

This creates `dist-webos/` with:

- `index.html`
- bundled assets
- `appinfo.json`
- `icon.png`

## Package as an IPK

Requires the `webOS` CLI tools, including `ares-package`.

```bash
npm run package:webos
```

## Public backend deployment

If another person is installing the `.ipk`, the TV cannot use your laptop LAN IP or `127.0.0.1`.
You need a publicly reachable API for:

- `GET /health`
- `GET /catalog`
- `GET /matches/:id/streams`

This repo now includes a production `Dockerfile` for the API.

### Deploy the API

Any host that can run a container or a Node service will work.

Container flow:

```bash
docker build -t sportzx-api .
docker run -p 8787:8787 \
  -e SPORTS_API_PORT=8787 \
  -e PRIVATE_SITE_BASE_URL=https://your-source.example \
  sportzx-api
```

Or on a Node host:

```bash
npm ci --omit=dev
npm run start:api
```

### Required environment variables

At minimum, set whichever backend mode you are actually using:

```bash
SPORTS_API_PORT=8787
PRIVATE_SITE_BASE_URL=https://your-source.example
```

Or:

```bash
UPSTREAM_CATALOG_URL=https://your-authorized-feed-api.example.com/catalog
```

Optional:

```bash
UPSTREAM_AUTH_BEARER=your-token
UPSTREAM_TIMEOUT_MS=12000
CATALOG_CACHE_TTL_MS=60000
STREAM_CACHE_TTL_MS=300000
STREAM_RESOLVE_RETRIES=2
```

### Point the TV app at the public API

Once your API is live on a real domain, set:

```bash
VITE_SPORTS_API_BASE_URL=https://your-public-api.example.com
```

Then rebuild and repackage:

```bash
npm run package:webos
```

The resulting `.ipk` will use the public API instead of your local machine.

### Deploy on Render

This repo includes [render.yaml](/home/sohil/webos-live-sports/render.yaml) and a production [Dockerfile](/home/sohil/webos-live-sports/Dockerfile).

Render steps:

1. Push `/home/sohil/webos-live-sports` to GitHub.
2. In Render, create a new `Blueprint` service from that repo.
3. Render will pick up `render.yaml` and create `sportzx-api`.
4. In the Render dashboard, fill the environment variables for the backend mode you use.

Do not set `SPORTS_API_PORT` on Render. The server already falls back to Render's injected `PORT` value automatically.

At minimum, for direct site extraction you need:

```bash
PRIVATE_SITE_BASE_URL=https://your-source.example
PRIVATE_SITE_MATCH_LINK_SELECTOR=...
PRIVATE_SITE_PROVIDER_LINK_SELECTOR=...
```

Or, for an upstream JSON feed:

```bash
UPSTREAM_CATALOG_URL=https://your-authorized-feed-api.example.com/catalog
UPSTREAM_AUTH_BEARER=your-token
```

After Render deploys, copy the public URL, then set it in your frontend build:

```bash
VITE_SPORTS_API_BASE_URL=https://your-render-service.onrender.com
```

Then rebuild the webOS package:

```bash
npm run package:webos
```

## Local backend adapter

The project now includes a small adapter API in [server/index.mjs](/home/sohil/webos-live-sports/server/index.mjs).

Routes:

- `GET /health`
- `GET /catalog`
- `GET /matches/:id/streams`

If `UPSTREAM_CATALOG_URL` is not set, the API returns a local manual catalog from [manualCatalog.mjs](/home/sohil/webos-live-sports/server/manualCatalog.mjs).
In that mode, `/catalog` returns event metadata with empty `streams`, and `/matches/:id/streams` resolves the actual links on demand through [streamResolver.mjs](/home/sohil/webos-live-sports/server/streamResolver.mjs).

If `UPSTREAM_CATALOG_URL` is set, the API fetches your upstream catalog response, applies auth headers from env, and normalizes the payload into the app contract through [catalogAdapter.mjs](/home/sohil/webos-live-sports/server/catalogAdapter.mjs).

Start it with:

```bash
npm run dev:api
```

## Real backend integration

Set:

```bash
VITE_SPORTS_API_BASE_URL=http://127.0.0.1:8787
UPSTREAM_CATALOG_URL=https://your-authorized-feed-api.example.com/catalog
UPSTREAM_AUTH_BEARER=your-token
```

The frontend expects:

### `GET /catalog`

```json
{
  "sports": [
    {
      "id": "football",
      "name": "Football",
      "accent": "#22c55e",
      "shortLabel": "FTB"
    }
  ],
  "matches": [
    {
      "id": "ucl-1",
      "sportId": "football",
      "league": "UEFA Champions Night",
      "round": "Quarterfinal",
      "title": "Arclight FC vs Northshore",
      "summary": "Rights-cleared live event",
      "venue": "Cobalt Arena",
      "status": "live",
      "kickoffLabel": "Started 19:00",
      "minuteLabel": "67'",
      "scoreLine": "2 - 1",
      "homeTeam": "Arclight FC",
      "awayTeam": "Northshore",
      "tags": ["HDR", "English"],
      "streams": [
        {
          "id": "ucl-1-main",
          "label": "World Feed",
          "provider": "SportsHub CDN",
          "quality": "1080p",
          "language": "English",
          "kind": "hls",
          "url": "https://signed.example.com/live.m3u8",
          "authorized": true,
          "headers": {
            "Authorization": "Bearer ..."
          }
        },
        {
          "id": "ucl-1-studio",
          "label": "Studio Feed",
          "provider": "SportsHub Embed",
          "quality": "Auto",
          "language": "English",
          "kind": "embed",
          "url": "https://player.example.com/embed/ucl-1",
          "authorized": true
        }
      ]
    }
  ]
}
```

The backend adapter also accepts a looser upstream shape, for example:

```json
{
  "sports": [
    { "id": "football", "name": "Football" }
  ],
  "events": [
    {
      "id": "match-1",
      "sportId": "football",
      "league": "Premier Night",
      "round": "Week 9",
      "homeTeam": "Northshore",
      "awayTeam": "Redbridge",
      "status": "live",
      "startTime": "2026-03-21T19:00:00Z",
      "minute": "72'",
      "homeScore": 2,
      "awayScore": 1,
      "streams": [
        {
          "id": "main",
          "label": "Main Feed",
          "provider": "Rights CDN",
          "quality": "1080p",
          "language": "English",
          "type": "hls",
          "url": "https://signed.example.com/live.m3u8",
          "headers": {
            "Authorization": "Bearer signed-playback-token"
          }
        }
      ]
    }
  ]
}
```

## Plugin-style stream resolver mode

If your source only returns stream links, keep the catalog local and set:

```bash
STREAM_RESOLVER_URL=https://your-resolver.example.com/streams
```

The local API will `POST` this payload when the user opens a match:

```json
{
  "match": {
    "id": "manual-football-1",
    "sportId": "football",
    "league": "Curated Match Board",
    "round": "Showcase",
    "title": "Redbridge vs Westhaven",
    "homeTeam": "Redbridge",
    "awayTeam": "Westhaven",
    "status": "live",
    "kickoffLabel": "Started 19:00"
  },
  "resolverQuery": {
    "eventId": "manual-football-1",
    "title": "Redbridge vs Westhaven",
    "search": "Redbridge vs Westhaven live"
  }
}
```

Your resolver can return any of these shapes:

```json
[
  {
    "id": "main",
    "label": "Main Feed",
    "provider": "Rights CDN",
    "quality": "1080p",
    "language": "English",
    "type": "hls",
    "url": "https://signed.example.com/live.m3u8"
  }
]
```

or

```json
{
  "streams": [
    {
      "id": "main",
      "label": "Main Feed",
      "provider": "Rights CDN",
      "quality": "1080p",
      "language": "English",
      "type": "hls",
      "url": "https://signed.example.com/live.m3u8"
    }
  ]
}
```

## Private local resolver without sharing the site here

If you do not want to paste the site URL, tokens, or request logic into chat:

1. Copy [privateResolver.template.mjs](/home/sohil/webos-live-sports/server/privateResolver.template.mjs) to [privateResolver.local.mjs](/home/sohil/webos-live-sports/server/privateResolver.local.mjs)
2. Put your private resolver request code in that local file
3. Keep the endpoint and tokens in `.env.local`

That local resolver file is ignored by git in [.gitignore](/home/sohil/webos-live-sports/.gitignore), so it stays only on your machine. The server will automatically prefer `server/privateResolver.local.mjs` when it exists.

The template now supports two private modes:

- JSON resolver mode via `STREAM_RESOLVER_URL`
- direct website extraction mode via `PRIVATE_SITE_BASE_URL`, `PRIVATE_SITE_SEARCH_URL_TEMPLATE`, `PRIVATE_SITE_MATCH_LINK_SELECTOR`, and `PRIVATE_SITE_STREAM_LINK_SELECTOR`

For sites that work like:

1. home page with many matches
2. match page with many provider links
3. provider page with the actual player

use these variables in `.env.local`:

```bash
PRIVATE_SITE_BASE_URL=https://licensed-source.example/
PRIVATE_SITE_CATALOG_CARD_SELECTOR=.match-card
PRIVATE_SITE_CATALOG_TITLE_SELECTOR=h2
PRIVATE_SITE_CATALOG_LEAGUE_SELECTOR=.league-name
PRIVATE_SITE_CATALOG_VENUE_SELECTOR=.venue
PRIVATE_SITE_MATCH_LINK_SELECTOR=.match-list a[href]
PRIVATE_SITE_PROVIDER_LINK_SELECTOR=#streams a[href]
PRIVATE_SITE_FINAL_STREAM_SELECTOR=source[src], video[src], a[href*=".m3u8"], a[href*=".mpd"], a[href*=".mp4"]
PRIVATE_SITE_FINAL_EMBED_SELECTOR=iframe[src]
PRIVATE_SITE_RESOLVE_PROVIDER_PAGES=true
PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED=true
```

How that example works:

1. The resolver fetches `PRIVATE_SITE_BASE_URL`
2. `loadPrivateCatalog()` can extract homepage matches for `/catalog` using the `PRIVATE_SITE_CATALOG_*` selectors
3. When a match is opened, the resolver picks the best match link using `PRIVATE_SITE_MATCH_LINK_SELECTOR`
4. It fetches the match page and extracts provider choices using `PRIVATE_SITE_PROVIDER_LINK_SELECTOR`
5. If `PRIVATE_SITE_RESOLVE_PROVIDER_PAGES=true`, it fetches each provider page and tries to extract a direct media URL or embed player
6. If no direct media URL is found, it can fall back to returning the provider page itself as `kind: "embed"`

## Notes

- The included stream URLs are demo HLS URLs for local UI validation only.
- Replace them with your production signed or tokenized stream URLs.
- If your provider only exposes an embeddable player page, return `kind: "embed"` with the page URL.
- HLS request headers from the catalog or resolver are applied through `hls.js` when the browser playback path supports it.
- If your provider needs DRM, add that next in a dedicated player integration layer.
