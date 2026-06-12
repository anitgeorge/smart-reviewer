export async function enrichArticle(canonicalUrl) {
  // TODO: load record, preprocess text, call LLM with structured prompt,
  // TODO: validate JSON output {summary, sentiment, rationale}, update record status
  return {
    canonicalUrl,
    summary: "Mock summary of the article.",
    sentiment: "neutral",
    rationale: "Mock rationale.",
    status: "enriched",
  };
}
