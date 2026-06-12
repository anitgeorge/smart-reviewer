export async function searchNews(query) {
  // TODO: call GNews, normalize fields, canonicalize URL, dedup, persist raw via getDb()
  return [
    {
      canonicalUrl: "https://example.com/a1",
      title: `Mock article about ${query}`,
      source: "Example Times",
      publishedAt: new Date().toISOString(),
      status: "acquired",
    },
    {
      canonicalUrl: "https://example.com/a2",
      title: `Second mock result for ${query}`,
      source: "Demo Post",
      publishedAt: new Date().toISOString(),
      status: "acquired",
    },
  ];
}
