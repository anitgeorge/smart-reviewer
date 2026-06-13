import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "./canonicalize.mjs";

// §6: lowercase host + strip fragment + strip trailing slash + strip www. are safe.
test("strips a leading www.", () => {
  assert.equal(canonicalize("https://www.example.com/article"), "https://example.com/article");
});

test("removes the #fragment", () => {
  assert.equal(canonicalize("https://example.com/a#section"), "https://example.com/a");
});

test("removes a trailing slash", () => {
  assert.equal(canonicalize("https://example.com/a/"), "https://example.com/a");
});

test("lowercases the host", () => {
  assert.equal(canonicalize("https://EXAMPLE.com/a"), "https://example.com/a");
});

// §6: tracking-param blocklist (not total stripping) — keep identifier params like ?id=.
test("strips tracking params but keeps content-bearing params", () => {
  assert.equal(
    canonicalize("https://example.com/a?utm_source=newsletter&id=5"),
    "https://example.com/a?id=5",
  );
});

test("strips fbclid, gclid, ref, mc_cid and _ga", () => {
  assert.equal(
    canonicalize("https://example.com/a?fbclid=x&gclid=y&ref=z&mc_cid=1&_ga=2&keep=ok"),
    "https://example.com/a?keep=ok",
  );
});

test("sorts query parameters so order does not matter", () => {
  assert.equal(canonicalize("https://example.com/a?b=2&a=1"), "https://example.com/a?a=1&b=2");
});

// The whole point: trivial variants collapse to one dedup key.
test("collapses www + trailing slash + tracking param to one canonical form", () => {
  const a = canonicalize("https://www.example.com/story/?utm_medium=email");
  const b = canonicalize("https://example.com/story");
  assert.equal(a, b);
});

// §6: scheme, path casing, and non-www subdomains are content-bearing — left untouched.
test("does NOT coerce http to https (scheme preserved)", () => {
  assert.notEqual(canonicalize("http://example.com/a"), canonicalize("https://example.com/a"));
});

test("preserves path casing (paths are case-sensitive)", () => {
  assert.notEqual(canonicalize("https://example.com/Foo"), canonicalize("https://example.com/foo"));
});

test("preserves non-www subdomains (opinion.x.com != x.com)", () => {
  assert.notEqual(
    canonicalize("https://opinion.example.com/a"),
    canonicalize("https://example.com/a"),
  );
});
