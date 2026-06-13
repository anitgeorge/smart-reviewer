// OpenAI connection smoke test (connection only).
// HARD BUDGET: at most 2 OpenAI requests total, including retries.
// The key lives in .env.local as LLM_API_KEY (confirmed to be the OpenAI key).
// The key value is NEVER printed, logged, or written anywhere.

const KEY = process.env.LLM_API_KEY;
if (!KEY) {
  console.error("LLM_API_KEY not set");
  process.exit(1);
}

const MAX_REQUESTS = 2;
let requests = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAI() {
  requests += 1;
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
    }),
  });
}

function reportSuccess(data) {
  console.log("connection: ok");
  console.log("model:", data.model);
  console.log("reply:", data.choices?.[0]?.message?.content?.trim());
  console.log("tokens used:", data.usage?.total_tokens);
  console.log("requests spent:", requests);
}

let attempt = 1;
while (true) {
  let res;
  try {
    res = await callOpenAI();
  } catch (err) {
    // Network-level failure. Retry once if budget remains.
    console.error(`network error: ${err?.code ?? err?.message ?? "unknown"}`);
    if (requests < MAX_REQUESTS) {
      console.error("transient network error; retrying once in 5s...");
      await sleep(5000);
      continue;
    }
    console.error(`requests spent: ${requests}`);
    process.exit(1);
  }

  if (res.ok) {
    const data = await res.json();
    reportSuccess(data);
    break;
  }

  // Non-OK: diagnose by status without ever printing the key.
  const status = res.status;
  const body = await res.text(); // no key is ever in the response body
  console.error(`HTTP ${status}`);
  console.error(body.slice(0, 300));

  if (status === 401) {
    console.error("diagnosis: invalid key — verify LLM_API_KEY. Not retrying (retry cannot fix auth).");
    console.error(`requests spent: ${requests}`);
    process.exit(1);
  }

  if (status === 429) {
    const isInsufficientQuota = /insufficient_quota/.test(body);
    if (isInsufficientQuota) {
      console.error("diagnosis: insufficient_quota — the account is out of quota. Not retrying.");
      console.error(`requests spent: ${requests}`);
      process.exit(1);
    }
    console.error("diagnosis: rate limit (transient).");
    if (requests < MAX_REQUESTS) {
      console.error("retrying once in 5s...");
      await sleep(5000);
      attempt += 1;
      continue;
    }
    console.error(`requests spent: ${requests}`);
    process.exit(1);
  }

  if (status === 404) {
    console.error("diagnosis: model not found — the key may not have access to gpt-4o-mini. Check model access. Not retrying.");
    console.error(`requests spent: ${requests}`);
    process.exit(1);
  }

  if (status >= 500) {
    console.error("diagnosis: server error (transient).");
    if (requests < MAX_REQUESTS) {
      console.error("retrying once in 5s...");
      await sleep(5000);
      attempt += 1;
      continue;
    }
    console.error(`requests spent: ${requests}`);
    process.exit(1);
  }

  // Any other non-OK status: do not retry, do not guess.
  console.error("diagnosis: unexpected status — not retrying.");
  console.error(`requests spent: ${requests}`);
  process.exit(1);
}
