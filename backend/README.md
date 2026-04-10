# Generic Backend

This folder contains the generic backend used by the CampusGPT dashboard.

Quick start

1. Copy `.env.example` to `.env` and fill in values for `SUPABASE_URL` and `SUPABASE_KEY`.

2. Install dependencies and start:

```bash
cd generic-backend
npm install
npm start
```

Endpoints
- `GET /dashboard` serve the dashboard UI
- `POST /api/v1/llm/save-key` save LLM API key on server
- `GET /api/v1/llm/models` list models (requires saved key)
- `POST /api/v1/llm/chat` proxy chat requests using saved key

Notes
- The server expects Node 18+ for built-in `fetch` support. If using older Node, install `node-fetch`.
- `secure_keys.json` is created at the project root when saving an API key and is gitignored.
