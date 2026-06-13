import { searchNews } from "@/lib/news";

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q");
  if (!query || !query.trim()) {
    // Reject missing/blank queries before spending any GNews quota.
    return Response.json({ error: "Missing query ?q=" }, { status: 400 });
  }
  try {
    const { articles, cached } = await searchNews(query);
    return Response.json({ articles, cached });
  } catch (err) {
    // GNews failure on a cache miss (§10): clean error, nothing cached, retry next time.
    console.error("search failed:", err.message);
    return Response.json(
      { error: "Couldn't fetch fresh articles, please try again." },
      { status: 502 },
    );
  }
}
