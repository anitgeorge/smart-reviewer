// One-time index setup for the acquisition/storage model (§5).
// Idempotent: re-running with identical options is a no-op. Run with:
//   node --env-file=.env.local scripts/setup-indexes.mjs   (or: npm run setup-indexes)
// Never prints the connection string.

import { MongoClient } from "mongodb";

const SEARCH_TTL_SECONDS = Number(process.env.SEARCH_TTL_SECONDS ?? 600); // 10 min
const FETCHED_ARTICLE_TTL_SECONDS = Number(process.env.FETCHED_ARTICLE_TTL_SECONDS ?? 86400); // 24h

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const db = client.db("smartreviewer");
  const articles = db.collection("articles");
  const searches = db.collection("searches");

  // 1. Hard dedup key — unique canonicalUrl (already created in the MongoDB smoke test).
  await articles.createIndex({ canonicalUrl: 1 }, { unique: true });
  console.log("articles.canonicalUrl: unique index ok");

  // 2. Partial TTL — evict ONLY unanalyzed (FETCHED) articles after 24h. The
  //    instant an article advances past FETCHED it stops matching the filter
  //    and is kept permanently.
  await articles.createIndex(
    { acquiredAt: 1 },
    {
      name: "fetched_ttl",
      expireAfterSeconds: FETCHED_ARTICLE_TTL_SECONDS,
      partialFilterExpression: { status: "FETCHED" },
    },
  );
  console.log(`articles partial TTL: FETCHED expire after ${FETCHED_ARTICLE_TTL_SECONDS}s ok`);

  // 3. Search cache TTL — the whole freshness mechanism (10 min).
  await searches.createIndex(
    { fetchedAt: 1 },
    { name: "search_ttl", expireAfterSeconds: SEARCH_TTL_SECONDS },
  );
  console.log(`searches.fetchedAt: TTL ${SEARCH_TTL_SECONDS}s ok`);

  // 4. Fast cache lookup by query.
  await searches.createIndex({ query: 1 }, { name: "query_lookup" });
  console.log("searches.query: lookup index ok");

  console.log("index setup: complete");
} finally {
  await client.close();
}
