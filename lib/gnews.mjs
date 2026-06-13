/**
 * The single GNews fetch (§8). On a cache miss this is the one place the scarce
 * GNews quota (100/day) is spent. Throws on any non-OK response so the caller
 * leaves the miss uncached and the next attempt retries (§10).
 *
 * `fetchImpl` is injectable purely for testing the URL contract without
 * spending quota; production passes the global `fetch`.
 *
 * @param {string} query  normalized query
 * @returns {Promise<object[]>} raw GNews articles
 */
export async function fetchGNews(query, { fetchImpl = fetch } = {}) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) throw new Error("GNEWS_API_KEY not set");

  const max = process.env.ARTICLES_PER_QUERY ?? "10";
  // Default publishedAt, not relevance: the GNews free tier only serves articles
  // from the last 30 days, and relevance-sorted top matches are often older than
  // that — the plan strips them and the response comes back empty despite many
  // total matches. publishedAt (newest-first) keeps results inside the window.
  const sortby = process.env.GNEWS_SORT ?? "publishedAt";

  // Build the query string with encodeURIComponent (spaces -> %20). URLSearchParams
  // would encode spaces as "+", which GNews treats literally and matches nothing.
  const params = [
    `q=${encodeURIComponent(query)}`,
    `lang=en`,
    `max=${encodeURIComponent(max)}`,
    `sortby=${encodeURIComponent(sortby)}`,
    `apikey=${encodeURIComponent(key)}`,
  ].join("&");
  const res = await fetchImpl(`https://gnews.io/api/v4/search?${params}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GNews HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.articles ?? [];
}
