import { enrichArticle } from "@/lib/enrich";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid or missing JSON body" }, { status: 400 });
  }
  const { canonicalUrl } = body || {};
  if (!canonicalUrl) {
    return Response.json({ error: "Missing canonicalUrl" }, { status: 400 });
  }
  const result = await enrichArticle(canonicalUrl);
  return Response.json({ result });
}
