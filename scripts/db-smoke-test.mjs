import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db("smartreviewer");
const articles = db.collection("articles");

await articles.insertOne({
  canonicalUrl: "https://example.com/smoke",
  title: "Smoke test",
  status: "acquired",
  acquiredAt: new Date(),
});
console.log("insert: ok");

const doc = await articles.findOne({ canonicalUrl: "https://example.com/smoke" });
console.log("read:", doc.title);

await articles.updateOne(
  { canonicalUrl: "https://example.com/smoke" },
  { $set: { sentiment: "neutral", status: "enriched" } }
);
console.log("update: ok");

await articles.createIndex({ canonicalUrl: 1 }, { unique: true });
try {
  await articles.insertOne({ canonicalUrl: "https://example.com/smoke", title: "Duplicate" });
  console.log("dedup FAILED: duplicate was accepted");
} catch (e) {
  console.log("dedup works: duplicate rejected");
}

await articles.deleteOne({ canonicalUrl: "https://example.com/smoke" });
console.log("delete: ok");
await client.close();
