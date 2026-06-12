import { searchNews } from "@/lib/news";

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q");
  if (!query) {
    return Response.json({ error: "Missing query ?q=" }, { status: 400 });
  }
  const articles = await searchNews(query);
  return Response.json({ articles });
}
