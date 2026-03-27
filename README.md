# webos-live-sports

TV-style live football frontend backed by a local Node API.

## Environment

Create `.env` from `.env.example` and set:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` if you want a different Claude model
- `SPORTSDB_API_KEY` if you are not using the public `123` key

## Development

```bash
npm install
npm run dev
```

That starts:

- Vite on `http://localhost:5173`
- Backend on `http://localhost:8787`

Vite proxies `/api/*` to the backend.

## Production

```bash
npm run build
npm start
```

The backend serves `dist/` and exposes:

- `GET /api/sportsdb/*`
- `POST /api/standings`
- `GET /api/health`
