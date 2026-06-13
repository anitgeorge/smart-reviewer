import { getDb } from "./db.js";
import { makeStore } from "./store.mjs";
import { fetchGNews } from "./gnews.mjs";
import { searchNews as acquire } from "./acquire.mjs";

// Composition root for acquisition + the article store. Wires the live Mongo
// store and the real GNews fetch into the pure orchestration (lib/acquire.mjs),
// keeping the route handlers thin. The orchestration, canonicalization, store
// contract and GNews URL contract are all unit-tested via injected deps.

const now = () => new Date();

async function store() {
  return makeStore(await getDb());
}

/** Acquisition entry (§9): cache-aware search. Returns { articles, cached }. */
export async function searchNews(query) {
  return acquire(query, { store: await store(), fetchGNews, now });
}

/** Results table (§13): analyzed articles, newest first. */
export async function getResults() {
  return (await store()).getEnrichedArticles();
}

/** Analyze read path (§12): the stored article, read directly by canonicalUrl. */
export async function getArticle(canonicalUrl) {
  return (await store()).getArticleByUrl(canonicalUrl);
}
