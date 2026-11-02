/**
 * Retrieve confirmed memories for one chat turn.
 * Embeddings when an API key is present; keyword overlap otherwise.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const MIN_SIMILARITY = 0.25;
const embeddingCache = new Map();

const STOP_WORDS = new Set([
  "user", "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "and", "or",
  "in", "on", "for", "with", "my", "me", "i", "you", "your", "it", "this", "that",
  "what", "who", "how", "why", "when", "where", "which", "do", "does", "did", "can",
  "could", "would", "should", "about", "from", "at", "by", "as", "if", "not", "but",
  "so", "just", "also", "have", "has", "had"
]);

export async function retrieveMemories({ query, nodes, k = 4, apiKey }) {
  const candidates = (Array.isArray(nodes) ? nodes : []).filter(
    (node) => node && node.type === "memory" && node.state === "confirmed"
  );
  const text = String(query || "").trim();
  const limit = Number.isFinite(k) ? k : 4;
  if (!text || candidates.length === 0 || limit <= 0) return [];

  if (apiKey) {
    try {
      const ranked = await rankByEmbedding(text, candidates, apiKey);
      return ranked.filter((item) => item.score >= MIN_SIMILARITY).slice(0, limit);
    } catch (error) {
      console.error("Memory embedding retrieval failed", error?.message || error);
    }
  }

  return rankByKeywords(text, candidates)
    .filter((item) => item.score > 0)
    .slice(0, limit);
}

async function rankByEmbedding(query, candidates, apiKey) {
  const vectors = new Map();
  const pending = [];

  for (const node of candidates) {
    const cached = embeddingCache.get(cacheKey(node));
    if (cached) vectors.set(node.id, cached);
    else pending.push(node);
  }

  const inputs = [...pending.map(embedText), query];
  const embedded = await embed(inputs, apiKey);
  const queryVector = embedded[embedded.length - 1];

  pending.forEach((node, index) => {
    embeddingCache.set(cacheKey(node), embedded[index]);
    vectors.set(node.id, embedded[index]);
  });

  return candidates
    .map((node) => ({
      id: node.id,
      title: node.title,
      content: node.content,
      score: cosine(vectors.get(node.id), queryVector)
    }))
    .sort((a, b) => b.score - a.score);
}

function rankByKeywords(query, candidates) {
  const queryWords = wordsOf(query);
  return candidates
    .map((node) => {
      const memoryWords = wordsOf(`${node.title || ""} ${node.content || ""}`);
      const score = queryWords.filter((word) => memoryWords.includes(word)).length;
      return { id: node.id, title: node.title, content: node.content, score };
    })
    .sort((a, b) => b.score - a.score);
}

function cacheKey(node) {
  return `${node.id}:${node.updatedAt}`;
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

function wordsOf(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}
