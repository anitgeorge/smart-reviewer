import { getResults } from "@/lib/news";

export async function GET() {
  // §13: store and display articles that have been summarized (ENRICHED only).
  const results = await getResults();
  return Response.json({ results });
}
