export async function GET() {
  // TODO: read enriched records from Mongo via getDb(), sorted by analyzedAt desc
  return Response.json({
    results: [
      {
        title: "Mock analyzed article",
        source: "Example Times",
        sentiment: "neutral",
        summary: "Mock summary.",
        analyzedAt: new Date().toISOString(),
      },
    ],
  });
}
