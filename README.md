# Smart Reviewer

A Next.js app that searches news (via GNews), stores articles in MongoDB, and (later) enriches them with an LLM summary + sentiment. This repo currently implements the **acquisition + storage** layer; enrichment is still stubbed.

## Prerequisites

- Node.js 20+ (developed on Node 24)
- A MongoDB Atlas cluster
- A GNews API key (free tier works — see limitations below)

## Environment variables

Create `.env.local` (git-ignored) with the required secrets:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `GNEWS_API_KEY` | ✅ | GNews API key |
| `LLM_API_KEY` | ✅ | OpenAI API key (note: **not** `OPENAI_API_KEY`) — used by enrichment, not yet wired |

Optional acquisition tuning (defaults shown; safe to omit):

| Variable | Default | Description |
|---|---|---|
| `ARTICLES_PER_QUERY` | `10` | `max` articles fetched per GNews search |
| `GNEWS_SORT` | `publishedAt` | GNews sort. **Use `publishedAt` on the free tier** — see limitations |
| `SEARCH_TTL_SECONDS` | `600` | Search-cache freshness window (10 min) |
| `FETCHED_ARTICLE_TTL_SECONDS` | `86400` | Eviction window for unanalyzed articles (24h) |

See `.env.example`.

## Setup

```bash
npm install
npm run setup-indexes   # one-time: creates Mongo indexes (idempotent), reads .env.local
npm run dev             # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js dev / production build / serve |
| `npm test` | Unit tests (`node:test`) |
| `npm run lint` | ESLint |
| `npm run setup-indexes` | Create the Mongo indexes (unique `canonicalUrl`, partial FETCHED TTL, search TTL, unique `query`) |

### Diagnostic scripts (`scripts/`)

Standalone connectivity probes — handy for verifying a fresh environment before running the app. Each reads `.env.local` and never prints secret values:

```bash
node --env-file=.env.local scripts/db-smoke-test.mjs
node --env-file=.env.local scripts/gnews-smoke-test.mjs [query]
node --env-file=.env.local scripts/openai-smoke-test.mjs
node --env-file=.env.local scripts/verify-roundtrip.mjs [query]   # end-to-end acquisition check
```

## API

| Route | Method | Description |
|---|---|---|
| `/api/health` | GET | Liveness check |
| `/api/search?q=<query>` | GET | Acquisition: returns `{ articles, cached }`. Cache hit serves from Mongo (0 GNews requests); miss fetches once. |
| `/api/results` | GET | Articles with `status: "ENRICHED"`, newest first |
| `/api/analyze` | POST | `{ canonicalUrl }` → enrichment (**currently mocked**) |

## How acquisition works

1. Normalize the query (trim + lowercase).
2. Cache check: if a `searches` doc exists (TTL keeps it ≤10 min), serve its articles from Mongo — no GNews call.
3. Miss: one GNews fetch, canonicalize + dedup URLs, upsert each article as `FETCHED` (write-once — existing docs are never clobbered), then write the `searches` cache doc.
4. Articles persist durably; unanalyzed (`FETCHED`) ones self-evict after 24h via a partial TTL, while enriched ones stay forever.

## Current scope & known limitations

- **Enrichment is mocked.** `/api/analyze` and `lib/enrich.js` return placeholder data and do not write to Mongo, so clicking *Analyze* will not yet add a row to the results table. (Enrichment is a separate workstream.)
- **GNews free tier** only serves articles from the **last 30 days**, with a 12-hour delay and truncated `content` (teaser, not full body). `GNEWS_SORT=relevance` frequently returns *empty* results on the free tier (top-relevance matches are often older than 30 days and get stripped), which is why the default is `publishedAt`.
- **Concurrent cold searches** for the same brand-new query can each spend a GNews request: both pass the cache check before either writes the cache doc. The unique `query` index prevents duplicate cache documents, but does not single-flight the fetch itself. Impact is bounded (a few of the 100/day quota under truly simultaneous identical cold searches); a server-side single-flight/reservation is a future improvement.
- One language (`en`) and one page of results per query.
