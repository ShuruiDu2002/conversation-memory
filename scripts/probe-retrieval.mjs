/**
 * Cross-lingual retrieval probe.
 *
 * Embed and cosine are copied from lib/retrieve.js. Importing that file from
 * a Node script is awkward without adding "type": "module" to package.json.
 * The probe also scores inferred demo memories (Jazz), which retrieveMemories
 * skips, so the jazz queries measure similarity rather than the state filter.
 *
 * Run: node --env-file=.env.local scripts/probe-retrieval.mjs
 */
import { demoNodes } from "../lib/demoData.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_PROMPT = "Rewrite the user's question in English. Output only the rewritten question.";
const TOP_K = 4;
const THRESHOLDS = [0, 0.1, 0.15, 0.2, 0.25, 0.3];
const COMPARE_THRESHOLD = 0.15;
const rewriteCache = new Map();

const EXTRA_MEMORIES = [
  {
    id: "mem-walnut-allergy",
    type: "memory",
    state: "confirmed",
    title: "Walnut Allergy",
    content: "User is allergic to walnuts and must avoid them in food."
  },
  {
    id: "mem-lactose",
    type: "memory",
    state: "confirmed",
    title: "Lactose Intolerance",
    content: "User is lactose intolerant and avoids milk and other dairy."
  }
];

const CASES = [
  { lang: "en", query: "What ingredients should I avoid cooking with?", expectedMemoryId: "mem-walnut-allergy" },
  { lang: "en", query: "Why do you think I like jazz?", expectedMemoryId: "mem-jazz" },
  { lang: "en", query: "Where am I starting graduate school?", expectedMemoryId: "mem-mscs" },
  { lang: "en", query: "What was my undergraduate degree?", expectedMemoryId: "mem-cs-undergrad" },
  { lang: "en", query: "Which courses do I want in the first quarter?", expectedMemoryId: "mem-courses" },
  { lang: "en", query: "What do I want to research?", expectedMemoryId: "mem-research" },
  { lang: "en", query: "Do I play narrative video games?", expectedMemoryId: "mem-games" },
  { lang: "en", query: "What weekend side project am I building?", expectedMemoryId: "mem-ai-rpg" },
  { lang: "en", query: "Am I interested in HCI?", expectedMemoryId: "mem-hci" },
  { lang: "en", query: "What dietary restriction do I have?", expectedMemoryId: "mem-lactose" },
  { lang: "zh", query: "我该避开什么食材", expectedMemoryId: "mem-walnut-allergy" },
  { lang: "zh", query: "你为什么觉得我喜欢爵士", expectedMemoryId: "mem-jazz" },
  { lang: "zh", query: "我研究生要去哪所学校", expectedMemoryId: "mem-mscs" },
  { lang: "zh", query: "我本科读的是什么", expectedMemoryId: "mem-cs-undergrad" },
  { lang: "zh", query: "我第一学期想上什么课", expectedMemoryId: "mem-courses" },
  { lang: "zh", query: "我想研究什么", expectedMemoryId: "mem-research" },
  { lang: "zh", query: "我喜欢玩什么样的游戏", expectedMemoryId: "mem-games" },
  { lang: "zh", query: "我周末在做哪个项目", expectedMemoryId: "mem-ai-rpg" },
  { lang: "zh", query: "我对人机交互感兴趣吗", expectedMemoryId: "mem-hci" },
  { lang: "zh", query: "我有什么饮食限制", expectedMemoryId: "mem-lactose" }
];

const NEGATIVES = [
  { lang: "en", query: "hello", negative: true },
  { lang: "en", query: "What is 12*8?", negative: true },
  { lang: "en", query: "What is the capital of France?", negative: true },
  { lang: "en", query: "Translate 'good morning' to French", negative: true },
  { lang: "zh", query: "你好", negative: true },
  { lang: "zh", query: "12乘8等于多少？", negative: true },
  { lang: "zh", query: "法国的首都是哪里？", negative: true },
  { lang: "zh", query: "把「早上好」翻译成法语", negative: true }
];

const memories = [
  ...demoNodes.filter(
    (node) => node.type === "memory" && (node.state === "confirmed" || node.state === "inferred")
  ),
  ...EXTRA_MEMORIES
];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing. Run with --env-file=.env.local");
    process.exit(1);
  }
  const missing = CASES.filter((item) => !memories.some((node) => node.id === item.expectedMemoryId));
  if (missing.length) {
    console.error("Expected memory is not in the corpus:", missing.map((item) => item.expectedMemoryId).join(", "));
    process.exit(1);
  }

  const queries = [...CASES, ...NEGATIVES];
  const rewrites = [];
  for (const item of queries) rewrites.push(await rewriteQuery(item.query, apiKey));

  const inputs = [...memories.map(embedText), ...queries.map((item) => item.query), ...rewrites];
  const vectors = await embed(inputs, apiKey);
  const memoryVectors = vectors.slice(0, memories.length);
  const rawVectors = vectors.slice(memories.length, memories.length + queries.length);
  const rewriteVectors = vectors.slice(memories.length + queries.length);
  const conditions = [
    { id: "A", name: "raw", texts: queries.map((item) => item.query), vectors: rawVectors },
    { id: "B", name: "rewrite", texts: rewrites, vectors: rewriteVectors }
  ].map((condition) => ({
    ...condition,
    cases: queries.map((item, index) => ({
      ...item,
      text: condition.texts[index],
      ranked: rank(memoryVectors, condition.vectors[index])
    }))
  }));

  console.log(`corpus ${memories.length} memories (confirmed + inferred demo, plus allergy and diet)`);
  console.log("");
  for (const condition of conditions) {
    console.log(`## ${condition.id} ${condition.name}`);
    console.log("");
    printQueries(condition);
    printMetrics(condition);
  }
  printComparison(conditions);
}

function printQueries(condition) {
  for (const item of condition.cases) {
    const top = item.ranked.slice(0, TOP_K);
    console.log(`[${item.lang}] ${item.query}`);
    if (condition.id === "B") console.log(`  rewrite: ${item.text}`);
    if (item.negative) {
      console.log("  negative");
    } else {
      const place = item.ranked.findIndex((hit) => hit.id === item.expectedMemoryId);
      const inTop = place >= 0 && place < TOP_K;
      const expected = item.ranked[place];
      console.log(
        `  expected ${item.expectedMemoryId}: ${inTop ? "in top 4" : `not in top 4 (rank ${place + 1}, ${formatScore(expected?.score)})`}`
      );
    }
    for (const hit of top) {
      const mark = !item.negative && hit.id === item.expectedMemoryId ? "*" : " ";
      console.log(`  ${mark} ${formatScore(hit.score)}  ${hit.title}  ${hit.id}`);
    }
    console.log("");
  }
}

function printMetrics(condition) {
  for (const lang of ["en", "zh"]) {
    const first = top1(condition.cases, lang);
    console.log(`${condition.id} ${condition.name} ${lang}`);
    console.log(`  top-1 ${formatRecall(first)}`);
    console.log(`  MRR ${mrr(condition.cases, lang).toFixed(3)}`);
    console.log("  threshold  recall@4       negatives");
    for (const threshold of THRESHOLDS) {
      const found = recall(condition.cases, lang, threshold);
      const passed = negativesPassing(condition.cases, lang, threshold);
      console.log(
        `  ${threshold.toFixed(2).padEnd(10)} ${formatRecall(found).padEnd(14)} ${passed.hits}/${passed.total}`
      );
    }
    console.log("");
  }
}

function printComparison(conditions) {
  const byId = Object.fromEntries(conditions.map((condition) => [condition.id, condition]));
  const cell = (id, lang, pick) => pick(byId[id].cases, lang);
  console.log("## Comparison");
  console.log("");
  console.log("| metric | A en | B en | A zh | B zh |");
  console.log("| --- | --- | --- | --- | --- |");
  console.log(
    `| top-1 | ${rate(cell("A", "en", top1))} | ${rate(cell("B", "en", top1))} | ${rate(cell("A", "zh", top1))} | ${rate(cell("B", "zh", top1))} |`
  );
  console.log(
    `| MRR | ${mrr(byId.A.cases, "en").toFixed(3)} | ${mrr(byId.B.cases, "en").toFixed(3)} | ${mrr(byId.A.cases, "zh").toFixed(3)} | ${mrr(byId.B.cases, "zh").toFixed(3)} |`
  );
  console.log(
    `| recall@4 @0.15 | ${rate(cell("A", "en", recallAtCompare))} | ${rate(cell("B", "en", recallAtCompare))} | ${rate(cell("A", "zh", recallAtCompare))} | ${rate(cell("B", "zh", recallAtCompare))} |`
  );
  console.log(
    `| negatives @0.15 | ${negCell("A", "en")} | ${negCell("B", "en")} | ${negCell("A", "zh")} | ${negCell("B", "zh")} |`
  );

  function negCell(id, lang) {
    const result = negativesPassing(byId[id].cases, lang, COMPARE_THRESHOLD);
    return `${result.hits}/${result.total}`;
  }
}

function rank(memoryVectors, queryVector) {
  return memories
    .map((node, index) => ({
      id: node.id,
      title: node.title,
      score: cosine(memoryVectors[index], queryVector)
    }))
    .sort((a, b) => b.score - a.score);
}

function positives(cases, lang) {
  return cases.filter((item) => item.lang === lang && !item.negative);
}

function top1(cases, lang) {
  const subset = positives(cases, lang);
  const hits = subset.filter((item) => item.ranked[0]?.id === item.expectedMemoryId).length;
  return { hits, total: subset.length };
}

function mrr(cases, lang) {
  const subset = positives(cases, lang);
  if (!subset.length) return 0;
  const total = subset.reduce((sum, item) => {
    const place = item.ranked.findIndex((hit) => hit.id === item.expectedMemoryId);
    return sum + (place >= 0 ? 1 / (place + 1) : 0);
  }, 0);
  return total / subset.length;
}

function recall(cases, lang, threshold) {
  const subset = positives(cases, lang);
  const hits = subset.filter((item) => {
    const top = item.ranked.slice(0, TOP_K);
    const found = top.find((hit) => hit.id === item.expectedMemoryId);
    return Boolean(found && found.score >= threshold);
  }).length;
  return { hits, total: subset.length };
}

function recallAtCompare(cases, lang) {
  return recall(cases, lang, COMPARE_THRESHOLD);
}

function negativesPassing(cases, lang, threshold) {
  const subset = cases.filter((item) => item.lang === lang && item.negative);
  const hits = subset.filter((item) => (item.ranked[0]?.score ?? 0) >= threshold).length;
  return { hits, total: subset.length };
}

function rate(result) {
  return result.total ? (result.hits / result.total).toFixed(2) : "n/a";
}

async function rewriteQuery(query, apiKey) {
  if (rewriteCache.has(query)) return rewriteCache.get(query);
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: REWRITE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: REWRITE_PROMPT },
        { role: "user", content: query }
      ]
    })
  });
  if (!response.ok) throw new Error(`Rewrite request failed (${response.status})`);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  const rewritten = text || query;
  rewriteCache.set(query, rewritten);
  return rewritten;
}

function formatRecall(result) {
  const rate = result.total ? (result.hits / result.total).toFixed(2) : "n/a";
  return `${result.hits}/${result.total} ${rate}`;
}

function formatScore(score) {
  return Number.isFinite(score) ? score.toFixed(3) : "n/a";
}

function embedText(node) {
  return `${node.title || ""}: ${node.content || ""}`.trim();
}

async function embed(inputs, apiKey) {
  const response = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs
    })
  });
  if (!response.ok) {
    throw new Error(`Embeddings request failed (${response.status})`);
  }
  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const vectors = new Array(inputs.length);
  for (const row of rows) {
    if (Number.isInteger(row?.index) && Array.isArray(row.embedding)) {
      vectors[row.index] = row.embedding;
    }
  }
  if (vectors.some((vector) => !Array.isArray(vector))) {
    throw new Error("Embeddings response was incomplete");
  }
  return vectors;
}

function cosine(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
