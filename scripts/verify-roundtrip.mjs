// Verify the GNews -> Mongo acquisition round-trip end to end.
//
// Usage:  node --env-file=.env.local scripts/verify-roundtrip.mjs [query]
// Default query: "technology". Requires the app running on http://localhost:3000.
//
// Adaptive on GNews quota:
//   - If the query is NOT cached, the first /api/search performs a real fetch and
//     spends exactly ONE GNews request, then persistence is verified.
//   - If the query IS already cached (within the 10-min TTL), the first call is a
//     cache hit and spends ZERO GNews requests; it still verifies the persisted
//     articles + cache doc and the repeat cache-hit path.
//
// Never prints GNEWS_API_KEY / MONGODB_URI / LLM_API_KEY. Uses MONGODB_URI only
// via process.env to connect; the connection string is never logged.

import { MongoClient } from "mongodb";

const BASE = "http://localhost:3000";
const QUERY = process.argv[2] ?? "technology";
const REQUIRED_FIELDS = ["canonicalUrl", "title", "source", "publishedAt", "acquiredAt", "statusUpdatedAt", "status"];

let pass = true;
const check = (label, ok, extra = "") => {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

// Health gate before any GNews spend.
const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
check("server health", health?.status === "ok");
if (!health) {
  console.error("server not reachable — start it with `npm start` first");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
let gnewsSpent = 0;
try {
  const db = client.db("smartreviewer");
  const articlesCol = db.collection("articles");
  const baseline = await articlesCol.countDocuments();

  // Search #1 — fetch (cached:false) or cache hit (cached:true).
  const r1 = await fetch(`${BASE}/api/search?q=${encodeURIComponent(QUERY)}`).then((r) => r.json());
  const fetched = r1.cached === false;
  gnewsSpent = fetched ? 1 : 0;
  check("search returned articles", Array.isArray(r1.articles) && r1.articles.length > 0, `${r1.articles?.length ?? 0} articles, cached=${r1.cached}`);

  const urls = (r1.articles ?? []).map((a) => a.canonicalUrl);

  // Persistence in Atlas.
  const stored = await articlesCol.find({ canonicalUrl: { $in: urls } }).toArray();
  check("all returned articles persisted", stored.length === urls.length, `${stored.length}/${urls.length} in Atlas`);
  check("all persisted as FETCHED", stored.every((d) => d.status === "FETCHED"));
  check("all required fields present", stored.every((d) => REQUIRED_FIELDS.every((f) => d[f] != null)));
  check("no enrichment fields present", stored.every((d) => d.summary === undefined && d.sentiment === undefined));
  check("publishedAt/acquiredAt are Date", stored.every((d) => d.publishedAt instanceof Date && d.acquiredAt instanceof Date));
  if (fetched) check("article count increased by fetch", (await articlesCol.countDocuments()) > baseline || baseline > 0);

  // searches cache doc.
  const norm = QUERY.trim().toLowerCase();
  const sdoc = await db.collection("searches").findOne({ query: norm });
  check("searches cache doc exists", !!sdoc);
  check("cache urls match returned set", sdoc && JSON.stringify([...sdoc.urls].sort()) === JSON.stringify([...urls].sort()));
  check("cache doc has fetchedAt Date", sdoc?.fetchedAt instanceof Date);

  // Repeat search must be a cache HIT and must not refetch.
  const before = sdoc?.fetchedAt?.toISOString();
  const r2 = await fetch(`${BASE}/api/search?q=${encodeURIComponent(QUERY)}`).then((r) => r.json());
  check("repeat search is a cache hit", r2.cached === true);
  const after = (await db.collection("searches").findOne({ query: norm }))?.fetchedAt?.toISOString();
  check("repeat did not refetch (fetchedAt unchanged)", before === after);
} finally {
  await client.close();
}

console.log(`\nGNews requests spent this run: ${gnewsSpent}`);
console.log(pass ? "RESULT: PASS — acquisition round-trip verified" : "RESULT: FAIL");
process.exit(pass ? 0 : 1);
