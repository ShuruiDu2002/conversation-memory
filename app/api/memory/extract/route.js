import { heuristicExtract } from "@/lib/heuristicExtract";

function debugLog(...args) {
  if (process.env.DEBUG_PROMPTS === "true") console.log(...args);
}

/**
 * Memory extraction: decide whether the latest user statement can be a
 * long-term memory. Importance is not the eligibility test.
 * New facts should usually be suggestions, not silent writes.
 */
export async function POST(request) {
  const body = await request.json();
  const userText = body.userMessage?.content || "";
  const assistantText = body.assistantMessage?.content || "";
  const outline = body.outline || "(empty tree)";
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const apiKey = process.env.OPENAI_API_KEY;

  if (!userText.trim()) {
    console.log("[extract] skipped: empty user message");
    return Response.json({
      mode: "demo",
      decision: "not_remembered",
      reason: "Nothing was said to remember.",
      operations: []
    });
  }

  if (!apiKey) {
    const extracted = heuristicExtract(userText, nodes);
    console.log("[extract] mode=demo (no OPENAI_API_KEY)");
    debugLog("[extract] user message:\n", userText);
    debugLog("[extract] heuristic result:\n", JSON.stringify(extracted, null, 2));
    return Response.json({ mode: "demo", ...extracted });
  }

  const extractUserPrompt = [
    "Current user model:",
    outline,
    "",
    "New exchange:",
    `User: ${userText}`,
    `Assistant: ${assistantText}`
  ].join("\n");

  console.log("[extract] mode=live model=gpt-4o-mini");
  debugLog("[extract] system prompt:\n", EXTRACT_PROMPT);
  debugLog("[extract] user prompt:\n", extractUserPrompt);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: extractUserPrompt }
        ]
      })
    });

    if (!response.ok) {
      console.error("[extract] OpenAI error", response.status);
      return Response.json(fallbackExtraction(userText, nodes, "Memory extraction failed; using the keyword fallback."));
    }

    let parsed;
    try {
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "{}";
      debugLog("[extract] raw model output:\n", raw);
      parsed = JSON.parse(raw);
    } catch {
      console.error("[extract] OpenAI JSON parse failed", response.status);
      return Response.json(fallbackExtraction(userText, nodes, "Memory extraction failed; using the keyword fallback."));
    }
    const extracted = normalizeExtraction(parsed, nodes, userText);
    debugLog("[extract] normalized result:\n", JSON.stringify(extracted, null, 2));
    return Response.json({ mode: "live", ...extracted });
  } catch {
    console.error("[extract] OpenAI request failed");
    return Response.json(fallbackExtraction(userText, nodes, "Memory extraction failed; using the keyword fallback."));
  }
}

function fallbackExtraction(userText, nodes, warning) {
  const extracted = heuristicExtract(userText, nodes);
  debugLog("[extract] falling back to heuristic:\n", JSON.stringify(extracted, null, 2));
  return { mode: "demo", warning, ...extracted };
}

const EXTRACT_PROMPT = `You decide whether the latest user message can become part of a long-term user model.

The AI decides whether something could be a memory. The user decides whether it should remain.

Decide only from the user's message. Text that appears only in the assistant's reply, including facts it repeats from the user model, is not a new fact.

Eligibility, not importance:
- A statement qualifies when it is about the user and is reasonably expected to stay true after this turn.
- Identity, education, career, projects, stable preferences, goals, relationships, living situation, habits, skills, and lasting constraints all qualify.
- Stable preferences count even when they seem minor. "I like chocolate." and "I prefer dark mode." should become memory candidates.
- Do not return an empty result because something seems unimportant or uninteresting. Importance is not the eligibility test.
- If it qualifies and is new, use suggest_memory so the user can accept or reject it.

Do not remember:
- temporary states ("I am hungry right now.", "I'm tired today.")
- one-off questions ("What fish is this?")
- general-knowledge questions ("Is chocolate healthy?")
- greetings, thanks, and task instructions
- text the user asks you to rewrite, translate, or quote ("Rewrite this sentence: I love jazz.")
- facts about other people ("My friend likes chocolate.")

After a statement qualifies, compare it with the closest existing memory before creating anything. Use this order:
1. Same fact with no new information, already under a fitting category → decision "duplicate", operations [].
   If that same fact is filed under the wrong category, do not return duplicate and do not create a second memory. A lasting health fact under "Interests" is the usual case. Return decision "suggested" and one suggest_rehome operation with that memory's id and the category it should have, such as ["Health & Diet"].
2. The user explicitly says that fact changed over time (moved, now, anymore, no longer, used to, previously, but now) → decision "update" and suggest_update on that memory's id.
3. Both are current facts, they cannot both be true, and there is no temporal change → decision "conflict". Do not overwrite.
4. The new statement makes the same fact more specific while the broader fact stays true → decision "refinement" and suggest_update on that memory's id. Do not create a second memory.
5. Same topic, but a different fact that can be true at the same time → decision "related" and suggest_memory under the existing parent. Do not overwrite the earlier memory.
6. Otherwise → decision "suggested" and suggest_memory.

Examples:
- Existing "User likes chocolate." plus "I like dark chocolate." is refinement, not related. Update that memory to "User likes chocolate, especially dark chocolate."
- Then "I prefer chocolate cake over cheesecake." is related. Add a separate memory. Do not change the chocolate memory.
- "I don't like chocolate anymore." or "I used to like chocolate, but now I hate it." is update, not conflict.
- "I hate chocolate." with no temporal change is conflict.
- "I also like classical music." beside jazz is related.
- "For this question, give me a very detailed explanation." does not qualify and must not update a stable preference.

Put the memory under the most semantically fitting existing category from the outline. If none fits, use a new top-level category with a short, general name (at most one new category per turn). Lasting constraints and health facts (allergies, dietary restrictions, medical conditions, accessibility needs) belong under "Health & Diet" or a similar category, never under "Interests". Interests are things the user enjoys. Education, Career, Projects, and Living keep their usual meaning. Keep max depth 2. Never use move or merge. Refinement and update must include the existing memory id from the outline. Never put those on a new suggest_memory.

If the existing title no longer describes the updated content, give a short new title (2-4 words). Otherwise omit newTitle. Do not copy a placeholder. The title names the fact, not the change. Never use words like Update, Change, New or Correction. For "allergic to crab but not to shrimp" the title is "Crab Allergy". A broader title does not still fit. "Shrimp and Crab Allergy" with new content "User is allergic to crab but not to shrimp." needs newTitle "Crab Allergy". "Nut Allergy" with new content about one kind of walnut needs a new title such as "Specific Walnut Allergy". A conflict may include newTitle the same way, for when the newer statement replaces the fact.

Always return JSON:
{
  "decision": "suggested" | "related" | "refinement" | "update" | "conflict" | "duplicate" | "not_remembered",
  "reason": "One short sentence to the user. Do not mention models, prompts, JSON, or decision names. Write the reason in second person ('You ...', 'This ...'), never 'The user'.",
  "operations": [
    {
      "type": "suggest_memory" | "suggest_rehome" | "suggest_update" | "conflict",
      "title": "short label",
      "content": "one sentence, third person: User ...",
      "path": ["Health & Diet"],
      "id": "existing memory id, required for suggest_update and suggest_rehome",
      "newContent": "replacement sentence for suggest_update",
      "newTitle": "optional 2-4 word title when the existing title no longer fits",
      "existingMemoryId": "existing memory id",
      "existingContent": "current memory text",
      "origin": "stated",
      "confidence": "high" | "medium" | "low",
      "reason": "You stated something about yourself that may remain relevant in later conversations."
    }
  ]
}

Reason examples: refinement "This adds more detail to something already in your model." Related "This is related to an existing interest, but it describes a separate preference." Update "You said this has changed, so an existing memory may need to be updated." Conflict "This disagrees with an existing memory, so it needs your review." Use an empty operations array for duplicate and not_remembered.`;

const DECISIONS = ["suggested", "related", "refinement", "update", "conflict", "duplicate", "not_remembered"];

const DEFAULT_REASONS = {
  suggested: "You stated something about yourself that may remain relevant in later conversations.",
  related: "This is related to an existing interest, but it describes a separate preference.",
  refinement: "This adds more detail to something already in your model.",
  update: "You said this has changed, so an existing memory may need to be updated.",
  conflict: "This disagrees with an existing memory, so it needs your review.",
  duplicate: "This matches something already in your model, so nothing new was added.",
  not_remembered: "This does not add a lasting fact about you."
};

function normalizeExtraction(parsed, nodes = [], userText = "") {
  let operations = normalizeOperations(parsed);
  const stated = typeof parsed?.decision === "string" ? parsed.decision : "";
  let decision = DECISIONS.includes(stated) ? stated : decisionFromOperations(operations);
  if (decision === "not_remembered" && operations.length) decision = decisionFromOperations(operations);

  const rehome = operations.find((op) => op.type === "suggest_rehome" && (op.id || op.existingMemoryId));
  if ((decision === "duplicate" || decision === "not_remembered") && rehome) {
    decision = "suggested";
    operations = [rehome];
  } else if (decision === "duplicate") {
    const synthesized = misfiledHealthMemory(userText, parsed?.reason, nodes);
    if (synthesized) {
      decision = "suggested";
      operations = [synthesized];
    } else {
      operations = [];
    }
  } else if (decision === "not_remembered") {
    operations = [];
  } else if (decision === "refinement" || decision === "update") {
    operations = operations
      .map((op) => toUpdate(op, nodes))
      .filter((op) => op.type === "suggest_update" && op.id);
  } else if (decision === "conflict") {
    operations = operations.filter((op) => op.type === "conflict");
  } else if (decision === "related" || decision === "suggested") {
    operations = operations.filter(
      (op) => op.type === "suggest_memory" || op.type === "add_memory" || op.type === "suggest_rehome"
    );
  }

  if (decision !== "not_remembered" && decision !== "duplicate" && operations.length === 0) {
    decision = "not_remembered";
  }
  const modelReason = decision === stated ? cleanReason(parsed?.reason) : "";
  const reason = modelReason || DEFAULT_REASONS[decision];
  operations = operations.map((op) => ({ ...op, reason: userFacingReason(op.reason, reason) }));
  return { decision, reason, operations };
}

const HEALTH_ALIASES = {
  walnut: ["nut", "walnut"],
  walnuts: ["nut", "walnut"],
  nut: ["nut", "walnut"],
  nuts: ["nut", "walnut"],
  peanut: ["peanut"],
  peanuts: ["peanut"],
  shellfish: ["shellfish"],
  dairy: ["dairy", "lactose"],
  lactose: ["lactose", "dairy"]
};

function expandChinese(value) {
  const text = String(value);
  const extra = [];
  if (/核桃|坚果/.test(text)) extra.push("walnut nut");
  if (/花生/.test(text)) extra.push("peanut");
  if (/海鲜|贝类|虾|蟹/.test(text)) extra.push("shellfish");
  if (/乳糖|牛奶|乳制品/.test(text)) extra.push("dairy lactose");
  if (/过敏/.test(text)) extra.push("allergy");
  return `${text} ${extra.join(" ")}`;
}

function expandedWords(value) {
  const words = wordsOf(expandChinese(value));
  const out = new Set(words);
  for (const word of words) {
    for (const alias of HEALTH_ALIASES[word] || []) out.add(alias);
  }
  return out;
}

function ancestorTitles(nodes, id) {
  const titles = [];
  let current = nodes.find((node) => node.id === id);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    titles.push(current.title || "");
    current = current.parentId ? nodes.find((node) => node.id === current.parentId) : null;
  }
  return titles;
}

function misfiledHealthMemory(userText, reason, nodes) {
  const query = expandedWords(`${userText || ""} ${reason || ""}`);
  if (![...query].some((word) => /allerg|diet|medical|accessib|nut|peanut|shellfish|dairy|lactose/.test(word))) {
    return null;
  }
  const ranked = [];
  for (const node of nodes) {
    if (node.type !== "memory") continue;
    const titles = ancestorTitles(nodes, node.parentId);
    if (!titles.some((title) => /^interests$/i.test(title))) continue;
    if (titles.some((title) => /health|diet/i.test(title))) continue;
    const haystack = expandedWords(`${node.title} ${node.content}`);
    let score = 0;
    for (const word of query) if (haystack.has(word)) score += 1;
    if (score > 0) ranked.push({ node, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[1] && ranked[1].score === ranked[0].score) return null;
  return {
    type: "suggest_rehome",
    id: ranked[0].node.id,
    title: ranked[0].node.title,
    path: ["Health & Diet"]
  };
}

function cleanTitle(value) {
  if (typeof value !== "string") return "";
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || title.length > 48) return "";
  if (title.split(" ").length > 6) return "";
  return title;
}

function toUpdate(op, nodes) {
  const id = op.id || op.existingMemoryId || "";
  const existing = nodes.find((node) => node.id === id);
  const proposed = cleanTitle(op.newTitle) || (existing ? cleanTitle(op.title) : "");
  const sameTitle =
    existing && proposed && proposed.toLowerCase() === String(existing.title || "").trim().toLowerCase();
  const next = {
    ...op,
    type: "suggest_update",
    id,
    newContent: op.newContent || op.content || "",
    newTitle: sameTitle ? "" : proposed
  };
  if (next.id && nodes.some((node) => node.id === next.id)) return next;
  const target = closestMemory(next, nodes);
  if (!target) return next;
  return {
    ...next,
    id: target.id,
    existingMemoryId: target.id,
    existingContent: next.existingContent || target.content
  };
}

function closestMemory(op, nodes) {
  const words = wordsOf(`${op.newContent || ""} ${op.content || ""} ${op.existingContent || ""} ${op.title || ""}`);
  let best = null;
  let bestScore = 0;
  for (const node of nodes) {
    if (node.type !== "memory") continue;
    const score = words.filter((word) => wordsOf(`${node.title} ${node.content}`).includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return bestScore > 0 ? best : null;
}

function wordsOf(value) {
  const skip = new Set(["user", "the", "a", "an", "is", "are", "to", "of", "and", "or", "in", "on", "for", "with"]);
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !skip.has(word));
}

function decisionFromOperations(operations) {
  if (operations.some((op) => op.type === "conflict")) return "conflict";
  if (operations.some((op) => op.type === "suggest_update" || op.type === "update_suggestion" || op.type === "update_memory")) {
    return "update";
  }
  if (operations.length) return "suggested";
  return "not_remembered";
}

function cleanReason(value) {
  if (typeof value !== "string") return "";
  const reason = value.trim().replace(/\s+/g, " ");
  if (!reason || reason.length > 280) return "";
  if (/same user-facing sentence|decision names|do not mention/i.test(reason)) return "";
  return reason;
}

function userFacingReason(operationReason, decisionReason) {
  const specific = cleanReason(operationReason);
  if (!specific) return decisionReason;
  if (/may remain relevant in later conversations|a later conversation may have changed/i.test(specific)) {
    return decisionReason;
  }
  return specific;
}

function normalizeOperations(parsed) {
  if (Array.isArray(parsed?.operations)) return parsed.operations;
  if (Array.isArray(parsed?.suggestions)) {
    return parsed.suggestions.map((item) => ({
      type: item.type || "suggest_memory",
      ...item
    }));
  }
  if (parsed?.fact || parsed?.content) {
    return [
      {
        type: "suggest_memory",
        title: parsed.topic || parsed.title || "Memory",
        content: parsed.fact || parsed.content,
        path: [parsed.category, parsed.topic].filter(Boolean)
      }
    ];
  }
  return [];
}
