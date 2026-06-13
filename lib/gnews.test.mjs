import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchGNews } from "./gnews.mjs";

const saved = {};
beforeEach(() => {
  for (const k of ["GNEWS_API_KEY", "ARTICLES_PER_QUERY", "GNEWS_SORT"]) saved[k] = process.env[k];
  process.env.GNEWS_API_KEY = "test-key";
  delete process.env.ARTICLES_PER_QUERY;
  delete process.env.GNEWS_SORT;
});
afterEach(() => {
  for (const k of ["GNEWS_API_KEY", "ARTICLES_PER_QUERY", "GNEWS_SORT"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function okResponse(articles) {
  return { ok: true, status: 200, async json() {
    return { totalArticles: articles.length, articles };
  } };
}

test("builds the GNews search URL with the documented defaults (§8)", async () => {
  let calledUrl;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return okResponse([{ title: "x" }]);
  };
  await fetchGNews("climate change", { fetchImpl });

  const u = new URL(calledUrl);
  assert.equal(u.origin + u.pathname, "https://gnews.io/api/v4/search");
  assert.equal(u.searchParams.get("q"), "climate change");
  assert.equal(u.searchParams.get("lang"), "en");
  assert.equal(u.searchParams.get("max"), "10");
  // publishedAt (newest-first), NOT relevance: on the GNews free tier, relevance
  // surfaces articles >30 days old which the plan strips, yielding empty results.
  assert.equal(u.searchParams.get("sortby"), "publishedAt");
  assert.equal(u.searchParams.get("apikey"), "test-key");
});

test("encodes spaces in the query as %20, not + (GNews treats + literally)", async () => {
  let calledUrl;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return okResponse([]);
  };
  await fetchGNews("renewable energy", { fetchImpl });

  assert.match(calledUrl, /[?&]q=renewable%20energy(&|$)/, "space must be %20");
  assert.ok(!calledUrl.includes("renewable+energy"), "must NOT encode space as +");
});

test("ARTICLES_PER_QUERY and GNEWS_SORT override the defaults", async () => {
  process.env.ARTICLES_PER_QUERY = "5";
  process.env.GNEWS_SORT = "publishedAt";
  let calledUrl;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return okResponse([]);
  };
  await fetchGNews("x", { fetchImpl });

  const u = new URL(calledUrl);
  assert.equal(u.searchParams.get("max"), "5");
  assert.equal(u.searchParams.get("sortby"), "publishedAt");
});

test("returns the articles array from the response body", async () => {
  const fetchImpl = async () => okResponse([{ title: "a" }, { title: "b" }]);
  const articles = await fetchGNews("x", { fetchImpl });
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "a");
});

test("throws with the status code on a non-OK response (so the miss is not cached)", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    async text() {
      return "rate limited";
    },
  });
  await assert.rejects(() => fetchGNews("x", { fetchImpl }), /429/);
});

test("throws if the API key is missing", async () => {
  delete process.env.GNEWS_API_KEY;
  await assert.rejects(() => fetchGNews("x", { fetchImpl: async () => okResponse([]) }), /GNEWS_API_KEY/);
});
