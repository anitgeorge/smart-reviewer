// MongoDB connectivity smoke test: insert -> read -> update -> dedup -> delete.
// Re-runnable; exits non-zero if any check fails. Never prints MONGODB_URI.
// Run: node --env-file=.env.local scripts/db-smoke-test.mjs

import { MongoClient } from "mongodb";

const SMOKE_URL = "https://example.com/smoke";

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
let failed = false;
try {
  const articles = client.db("smartreviewer").collection("articles");
  await articles.deleteOne({ canonicalUrl: SMOKE_URL }); // clean any leftover from a prior run

  // Use the real lifecycle statuses so the probe mirrors production storage.
  await articles.insertOne({
    canonicalUrl: SMOKE_URL,
    title: "Smoke test",
    status: "FETCHED",
    acquiredAt: new Date(),
  });
  console.log("insert: ok");

  const doc = await articles.findOne({ canonicalUrl: SMOKE_URL });
  console.log("read:", doc.title);

  await articles.updateOne(
    { canonicalUrl: SMOKE_URL },
    { $set: { sentiment: "neutral", status: "ENRICHED" } },
  );
  console.log("update: ok");

  await articles.createIndex({ canonicalUrl: 1 }, { unique: true });
  try {
    await articles.insertOne({ canonicalUrl: SMOKE_URL, title: "Duplicate" });
    console.error("dedup FAILED: duplicate was accepted");
    failed = true;
  } catch {
    console.log("dedup works: duplicate rejected");
  }

  await articles.deleteOne({ canonicalUrl: SMOKE_URL });
  console.log("delete: ok");
} finally {
  await client.close();
}

process.exit(failed ? 1 : 0);
