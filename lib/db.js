import { MongoClient } from "mongodb";

let cached = null;

export async function getDb() {
  if (cached) return cached;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cached = client.db("smartreviewer");
  return cached;
}
