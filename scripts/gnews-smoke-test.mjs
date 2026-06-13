const KEY = process.env.GNEWS_API_KEY;
if (!KEY) {
  console.error("GNEWS_API_KEY not set");
  process.exit(1);
}

async function search(q) {
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=3&apikey=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const query = process.argv[2] ?? "technology";
const data = await search(query);
console.log("query:", query);
console.log("totalArticles:", data.totalArticles);
console.log("returned:", data.articles.length);

const a = data.articles[0];
console.log("--- first article field check ---");
for (const field of ["title", "description", "content", "url", "image", "publishedAt"]) {
  const present = a[field] !== undefined && a[field] !== null;
  console.log(`${field}: ${present ? "present" : "MISSING"}`);
}
console.log("source.name:", a.source?.name ?? "MISSING");
console.log("--- content truncation check ---");
const truncated = /\.\.\.\s*\[\d+ chars\]$/.test(a.content ?? "");
console.log("content truncated (free tier):", truncated ? "yes" : "no");
console.log("content length:", (a.content ?? "").length);
console.log("--- sample (title only) ---");
data.articles.forEach((art, i) => console.log(`${i + 1}. ${art.title} — ${art.source?.name}`));
