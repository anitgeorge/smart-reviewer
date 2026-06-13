import { canonicalize } from "./canonicalize.mjs";

/**
 * Acquisition entry point (§9). Given a raw query string, return a useful set
 * of articles while spending the scarce GNews quota as rarely as possible.
 *
 * Pure orchestration: all I/O is injected via `deps` so the logic is testable
 * without a live Mongo or a GNews request.
 *
 * @param {string} rawQuery
 * @param {object} deps
 * @param {object} deps.store        repository (§3): getSearch, getArticlesByUrls, upsertArticle, saveSearch
 * @param {(q: string) => Promise<object[]>} deps.fetchGNews  returns raw GNews articles; throws on failure
 * @param {() => Date} deps.now
 * @returns {Promise<{ articles: object[], cached: boolean }>}
 */
export async function searchNews(rawQuery, { store, fetchGNews, now }) {
  // Step 1 — normalize the query so trivial variants share a cache entry.
  const q = rawQuery.trim().toLowerCase();

  // A blank/whitespace-only query must never reach GNews or write a cache row.
  // (The route also rejects these with a 400; this is defense in depth.)
  if (!q) throw new Error("blank query");

  // Step 2/3a — cache hit? TTL physically deletes expired docs, so "fresh" = "exists".
  const cached = await store.getSearch(q);
  if (cached) {
    return { articles: await orderedByUrls(store, cached.urls), cached: true };
  }

  // Step 3b — cache miss: exactly one GNews request. A failure propagates and is
  // NOT cached (§10) — no search doc is written, so the next attempt retries.
  const raw = await fetchGNews(q);

  // Canonicalize + normalize each article to the storage schema, deduping any
  // raw URLs that collapse to the same canonical key (§6, §11).
  const urls = [];
  for (const item of raw) {
    const canonicalUrl = canonicalize(item.url);
    if (urls.includes(canonicalUrl)) continue;
    urls.push(canonicalUrl);
    await store.upsertArticle(toArticle(canonicalUrl, item, now()));
  }

  // Arm the 10-minute search cache with the canonical URLs this query returned.
  await store.saveSearch(q, urls, now());

  return { articles: await orderedByUrls(store, urls), cached: false };
}

// Read articles back from the store and order them to match `urls` (the store's
// $in query gives no ordering guarantee; relevance order matters for the UI).
async function orderedByUrls(store, urls) {
  const found = await store.getArticlesByUrls(urls);
  const byUrl = new Map(found.map((a) => [a.canonicalUrl, a]));
  return urls.map((u) => byUrl.get(u)).filter(Boolean);
}

// Map a raw GNews article to the durable `articles` schema (§3.1). Acquisition
// only ever sets these fields, always at status FETCHED.
function toArticle(canonicalUrl, item, at) {
  return {
    canonicalUrl,
    title: item.title,
    source: item.source?.name,
    publishedAt: new Date(item.publishedAt),
    description: item.description,
    image: item.image,
    url: item.url,
    acquiredAt: at,
    status: "FETCHED",
    statusUpdatedAt: at,
  };
}
