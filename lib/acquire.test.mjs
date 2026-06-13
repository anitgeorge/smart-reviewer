import { test } from "node:test";
import assert from "node:assert/strict";
import { searchNews } from "./acquire.mjs";

const FIXED_NOW = new Date("2026-06-13T12:00:00.000Z");
const now = () => FIXED_NOW;

// A fake store standing in for the Mongo repository (§3). Deliberately returns
// getArticlesByUrls results in REVERSED order so tests prove the orchestration
// re-orders the response to match the query's `urls` order, not the store's.
function makeFakeStore(seedArticles = []) {
  const articles = new Map(seedArticles.map((a) => [a.canonicalUrl, a]));
  const searches = new Map();
  return {
    upserts: [],
    saves: [],
    async getSearch(q) {
      return searches.get(q) ?? null;
    },
    async getArticlesByUrls(urls) {
      const found = urls.map((u) => articles.get(u)).filter(Boolean);
      return found.reverse();
    },
    async upsertArticle(doc) {
      this.upserts.push(doc);
      if (!articles.has(doc.canonicalUrl)) articles.set(doc.canonicalUrl, doc); // $setOnInsert semantics
    },
    async saveSearch(q, urls, fetchedAt) {
      this.saves.push({ q, urls, fetchedAt });
      searches.set(q, { query: q, urls, fetchedAt });
    },
    _seedSearch(q, urls) {
      searches.set(q, { query: q, urls, fetchedAt: FIXED_NOW });
    },
  };
}

function rawArticle(overrides = {}) {
  return {
    title: "A headline",
    description: "A teaser.",
    content: "truncated... [123 chars]",
    url: "https://www.example.com/story/",
    image: "https://example.com/img.jpg",
    publishedAt: "2026-06-12T09:00:00.000Z",
    source: { name: "Example Times" },
    ...overrides,
  };
}

test("cold cache MISS: calls GNews once, stores articles, arms the search cache", async () => {
  const store = makeFakeStore();
  let gnewsCalls = 0;
  const fetchGNews = async (q) => {
    gnewsCalls++;
    assert.equal(q, "climate");
    return [rawArticle({ url: "https://a.com/1" }), rawArticle({ url: "https://b.com/2" })];
  };

  const result = await searchNews("climate", { store, fetchGNews, now });

  assert.equal(gnewsCalls, 1, "exactly one GNews request on a miss");
  assert.equal(result.cached, false);
  assert.equal(result.articles.length, 2);
  assert.equal(store.upserts.length, 2, "each article upserted");
  assert.equal(store.saves.length, 1, "search cache written once");
  assert.deepEqual(store.saves[0].urls, ["https://a.com/1", "https://b.com/2"]);
  assert.equal(store.saves[0].q, "climate");
});

test("MISS stores articles with the FETCHED lifecycle status and normalized fields", async () => {
  const store = makeFakeStore();
  const fetchGNews = async () => [rawArticle({ url: "https://a.com/1" })];

  await searchNews("climate", { store, fetchGNews, now });

  const doc = store.upserts[0];
  assert.equal(doc.canonicalUrl, "https://a.com/1");
  assert.equal(doc.title, "A headline");
  assert.equal(doc.source, "Example Times", "source taken from GNews source.name");
  assert.equal(doc.url, "https://a.com/1", "original url preserved for linking out");
  assert.ok(doc.publishedAt instanceof Date, "publishedAt coerced to Date");
  assert.equal(doc.status, "FETCHED");
  assert.equal(doc.acquiredAt.getTime(), FIXED_NOW.getTime());
  assert.equal(doc.statusUpdatedAt.getTime(), FIXED_NOW.getTime());
});

test("MISS canonicalizes URLs and returns results in fetch order", async () => {
  const store = makeFakeStore();
  // www + trailing slash should canonicalize to the bare form.
  const fetchGNews = async () => [
    rawArticle({ url: "https://www.first.com/a/" }),
    rawArticle({ url: "https://second.com/b" }),
  ];

  const result = await searchNews("x", { store, fetchGNews, now });

  assert.deepEqual(
    result.articles.map((a) => a.canonicalUrl),
    ["https://first.com/a", "https://second.com/b"],
    "results ordered by fetch order, not store order",
  );
});

test("a blank query (empty or whitespace-only) is rejected without spending GNews", async () => {
  const store = makeFakeStore();
  let fetchCalled = false;
  const fetchGNews = async () => {
    fetchCalled = true;
    return [rawArticle()];
  };

  for (const blank of ["", "   ", "\t\n"]) {
    await assert.rejects(() => searchNews(blank, { store, fetchGNews, now }), /blank|empty/i);
  }
  assert.equal(fetchCalled, false, "GNews must not be called for a blank query");
  assert.equal(store.saves.length, 0, "no cache row written for a blank query");
});

test("two raw URLs that canonicalize to the same key are deduped", async () => {
  const store = makeFakeStore();
  const fetchGNews = async () => [
    rawArticle({ url: "https://www.dup.com/a/" }),
    rawArticle({ url: "https://dup.com/a" }),
  ];

  const result = await searchNews("x", { store, fetchGNews, now });

  assert.equal(result.articles.length, 1, "single canonical article");
  assert.deepEqual(store.saves[0].urls, ["https://dup.com/a"], "urls list deduped too");
});

test("cache HIT: serves from store, spends ZERO GNews requests", async () => {
  const store = makeFakeStore([
    { canonicalUrl: "https://a.com/1", title: "One", status: "FETCHED" },
    { canonicalUrl: "https://b.com/2", title: "Two", status: "ENRICHED" },
  ]);
  store._seedSearch("climate", ["https://a.com/1", "https://b.com/2"]);
  const fetchGNews = async () => {
    throw new Error("GNews must not be called on a cache hit");
  };

  const result = await searchNews("climate", { store, fetchGNews, now });

  assert.equal(result.cached, true);
  assert.deepEqual(
    result.articles.map((a) => a.canonicalUrl),
    ["https://a.com/1", "https://b.com/2"],
    "served in cached urls order",
  );
  assert.equal(store.upserts.length, 0);
  assert.equal(store.saves.length, 0);
});

test("query is normalized (trim + lowercase) for cache lookup and write", async () => {
  const store = makeFakeStore();
  const fetchGNews = async (q) => {
    assert.equal(q, "climate change", "GNews queried with normalized q");
    return [rawArticle({ url: "https://a.com/1" })];
  };

  await searchNews("  Climate CHANGE  ", { store, fetchGNews, now });

  assert.equal(store.saves[0].q, "climate change");
});

test("re-encountering an ENRICHED article never clobbers it (write-once)", async () => {
  const store = makeFakeStore([
    {
      canonicalUrl: "https://a.com/1",
      title: "One",
      status: "ENRICHED",
      summary: "paid-for summary",
      sentiment: "positive",
    },
  ]);
  const fetchGNews = async () => [rawArticle({ url: "https://a.com/1" })];

  const result = await searchNews("climate", { store, fetchGNews, now });

  const returned = result.articles.find((a) => a.canonicalUrl === "https://a.com/1");
  assert.equal(returned.status, "ENRICHED", "stored status preserved");
  assert.equal(returned.summary, "paid-for summary", "enrichment not destroyed");
});

test("GNews failure on a MISS: error propagates and NO search doc is written", async () => {
  const store = makeFakeStore();
  const fetchGNews = async () => {
    throw new Error("HTTP 429");
  };

  await assert.rejects(
    () => searchNews("climate", { store, fetchGNews, now }),
    /429/,
  );
  assert.equal(store.saves.length, 0, "a failed fetch must not be cached");
});
