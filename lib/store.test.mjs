import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStore } from "./store.mjs";

// Minimal fake of the Mongo Db handle: records every collection operation so we
// can lock the query contract (the $setOnInsert / $in / status-filter / sort
// shapes that the design depends on) without a live database.
function makeFakeDb(results = {}) {
  const ops = [];
  const collection = (name) => ({
    async findOne(filter) {
      ops.push({ op: "findOne", name, filter });
      return results[`${name}.findOne`] ?? null;
    },
    find(filter) {
      ops.push({ op: "find", name, filter });
      return {
        sort(spec) {
          ops.push({ op: "sort", name, spec });
          return this;
        },
        async toArray() {
          return results[`${name}.find`] ?? [];
        },
      };
    },
    async updateOne(filter, update, options) {
      ops.push({ op: "updateOne", name, filter, update, options });
    },
    async replaceOne(filter, doc, options) {
      ops.push({ op: "replaceOne", name, filter, doc, options });
    },
  });
  return { db: { collection }, ops };
}

test("getSearch looks up searches by query", async () => {
  const { db, ops } = makeFakeDb({ "searches.findOne": { query: "x", urls: ["u"] } });
  const result = await makeStore(db).getSearch("x");
  assert.deepEqual(result, { query: "x", urls: ["u"] });
  assert.deepEqual(ops[0], { op: "findOne", name: "searches", filter: { query: "x" } });
});

test("getArticlesByUrls queries articles with a $in on canonicalUrl", async () => {
  const { db, ops } = makeFakeDb({ "articles.find": [{ canonicalUrl: "u1" }] });
  const result = await makeStore(db).getArticlesByUrls(["u1", "u2"]);
  assert.deepEqual(result, [{ canonicalUrl: "u1" }]);
  assert.deepEqual(ops[0], {
    op: "find",
    name: "articles",
    filter: { canonicalUrl: { $in: ["u1", "u2"] } },
  });
});

test("upsertArticle uses $setOnInsert + upsert so existing docs are NEVER clobbered", async () => {
  const { db, ops } = makeFakeDb();
  const doc = { canonicalUrl: "u1", title: "T", status: "FETCHED" };
  await makeStore(db).upsertArticle(doc);
  const call = ops[0];
  assert.equal(call.op, "updateOne");
  assert.equal(call.name, "articles");
  assert.deepEqual(call.filter, { canonicalUrl: "u1" });
  assert.deepEqual(call.update, { $setOnInsert: doc }, "must be $setOnInsert, not $set");
  assert.deepEqual(call.options, { upsert: true });
});

test("saveSearch overwrites the query's cache doc with fresh urls + timestamp", async () => {
  const { db, ops } = makeFakeDb();
  const at = new Date("2026-06-13T12:00:00Z");
  await makeStore(db).saveSearch("climate", ["u1", "u2"], at);
  const call = ops[0];
  assert.equal(call.op, "replaceOne");
  assert.equal(call.name, "searches");
  assert.deepEqual(call.filter, { query: "climate" });
  assert.deepEqual(call.doc, { query: "climate", urls: ["u1", "u2"], fetchedAt: at });
  assert.deepEqual(call.options, { upsert: true });
});

test("getEnrichedArticles returns only ENRICHED, newest first (§13)", async () => {
  const { db, ops } = makeFakeDb({ "articles.find": [{ canonicalUrl: "u1", status: "ENRICHED" }] });
  const result = await makeStore(db).getEnrichedArticles();
  assert.deepEqual(result, [{ canonicalUrl: "u1", status: "ENRICHED" }]);
  assert.deepEqual(ops[0], { op: "find", name: "articles", filter: { status: "ENRICHED" } });
  assert.deepEqual(ops[1], { op: "sort", name: "articles", spec: { analyzedAt: -1 } });
});

test("getArticleByUrl reads a single stored article by canonicalUrl (§12)", async () => {
  const { db, ops } = makeFakeDb({ "articles.findOne": { canonicalUrl: "u1", status: "FETCHED" } });
  const result = await makeStore(db).getArticleByUrl("u1");
  assert.deepEqual(result, { canonicalUrl: "u1", status: "FETCHED" });
  assert.deepEqual(ops[0], { op: "findOne", name: "articles", filter: { canonicalUrl: "u1" } });
});
