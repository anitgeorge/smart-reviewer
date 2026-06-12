"use client";
import { useState, useEffect } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setArticles(data.articles || []);
    setLoading(false);
  }

  async function analyze(canonicalUrl) {
    await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalUrl }),
    });
    loadResults();
  }

  async function loadResults() {
    const res = await fetch("/api/results");
    const data = await res.json();
    setResults(data.results || []);
  }

  useEffect(() => {
    loadResults();
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Smart Reviewer</h1>

      <section className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search news..."
          className="border p-2 flex-1 rounded"
        />
        <button onClick={search} className="border px-4 rounded">
          {loading ? "Searching..." : "Search"}
        </button>
      </section>

      <section className="space-y-2">
        {articles.map((a) => (
          <div
            key={a.canonicalUrl}
            className="border p-3 rounded flex justify-between items-center"
          >
            <div>
              <div className="font-medium">{a.title}</div>
              <div className="text-sm opacity-70">{a.source}</div>
            </div>
            <button
              onClick={() => analyze(a.canonicalUrl)}
              className="border px-3 py-1 rounded"
            >
              Analyze
            </button>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Analyzed articles</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Title</th>
              <th>Source</th>
              <th>Sentiment</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{r.title}</td>
                <td>{r.source}</td>
                <td>{r.sentiment}</td>
                <td>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
