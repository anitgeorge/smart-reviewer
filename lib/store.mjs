/**
 * The storage repository (§3). A thin factory over a Mongo `Db` handle so the
 * acquisition orchestration (and the route layer) depend on a small, intention-
 * revealing interface rather than raw collection calls.
 *
 * @param {import('mongodb').Db} db
 */
export function makeStore(db) {
  const articles = db.collection("articles");
  const searches = db.collection("searches");

  return {
    // §3.2 — the ephemeral query cache. Existence == fresh (TTL deletes expired).
    getSearch(query) {
      return searches.findOne({ query });
    },

    // §3.1 — fetch durable articles by their canonical URLs.
    getArticlesByUrls(urls) {
      return articles.find({ canonicalUrl: { $in: urls } }).toArray();
    },

    // §11 — write-once: $setOnInsert means a known article is left completely
    // untouched (enrichment is never destroyed or re-run).
    upsertArticle(doc) {
      return articles.updateOne(
        { canonicalUrl: doc.canonicalUrl },
        { $setOnInsert: doc },
        { upsert: true },
      );
    },

    // §9 step 5 — arm/refresh the query's cache with the urls it returned.
    // With a unique index on `query`, two concurrent cold upserts can race; the
    // loser throws E11000. The cache doc exists either way, so that race is benign
    // and swallowed; any other error propagates.
    async saveSearch(query, urls, fetchedAt) {
      try {
        await searches.replaceOne({ query }, { query, urls, fetchedAt }, { upsert: true });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    },

    // §13 — the results table: only analyzed articles, newest first.
    getEnrichedArticles() {
      return articles.find({ status: "ENRICHED" }).sort({ analyzedAt: -1 }).toArray();
    },

    // §12 — the Analyze read path: server reads the existing stored doc directly.
    getArticleByUrl(canonicalUrl) {
      return articles.findOne({ canonicalUrl });
    },
  };
}
