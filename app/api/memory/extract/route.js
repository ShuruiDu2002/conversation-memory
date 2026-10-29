import { heuristicExtract } from "@/lib/heuristicExtract";

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
    console.log("[extract] user message:\n", userText);
    console.log("[extract] heuristic result:\n", JSON.stringify(extracted, null, 2));
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
  console.log("[extract] system prompt:\n", EXTRACT_PROMPT);
  console.log("[extract] user prompt:\n", extractUserPrompt);

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
      const errText = await response.text();
      console.error("[extract] OpenAI error", response.status, errText);
      const extracted = heuristicExtract(userText, nodes);
      console.log("[extract] falling back to heuristic:\n", JSON.stringify(extracted, null, 2));
      return Response.json({ mode: "demo", ...extracted });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    console.log("[extract] raw model output:\n", raw);
    const parsed = JSON.parse(raw);
    const extracted = normalizeExtraction(parsed, nodes);
    console.log("[extract] normalized result:\n", JSON.stringify(extracted, null, 2));
    return Response.json({ mode: "live", ...extracted });
  } catch (error) {
    console.error("[extract] route failed", error);
    const extracted = heuristicExtract(userText, nodes);
    console.log("[extract] falling back to heuristic:\n", JSON.stringify(extracted, null, 2));
    return Response.json({ mode: "demo", ...extracted });
  }
}

const EXTRACT_PROMPT = `You decide whether the latest user message can become part of a long-term user model.

The AI decides whether something could be a memory. The user decides whether it should remain.

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
1. Same fact with no new information → decision "duplicate", operations [].
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

Do not create categories. Do not use move or merge. Refinement and update must include the existing memory id from the outline. Never put those on a new suggest_memory.

Always return JSON:
{
  "decision": "suggested" | "related" | "refinement" | "update" | "conflict" | "duplicate" | "not_remembered",
  "reason": "One short sentence to the user. Do not mention models, prompts, JSON, or decision names.",
  "operations": [
    {
      "type": "suggest_memory" | "suggest_update" | "conflict",
      "title": "short label",
      "content": "one sentence, third person: User ...",
      "path": ["Interests"],
      "id": "existing memory id, required for suggest_update",
      "newContent": "replacement sentence for suggest_update",
      "existingMemoryId": "existing memory id",
      "existingContent": "current memory text",
      "origin": "stated",
      "confidence": "high" | "medium" | "low",
      "reason": "the same user-facing sentence"
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

function normalizeExtraction(parsed, nodes = []) {
  let operations = normalizeOperations(parsed);
  const stated = typeof parsed?.decision === "string" ? parsed.decision : "";
  let decision = DECISIONS.includes(stated) ? stated : decisionFromOperations(operations);
  if (decision === "not_remembered" && operations.length) decision = decisionFromOperations(operations);

  if (decision === "duplicate" || decision === "not_remembered") {
    operations = [];
  } else if (decision === "refinement" || decision === "update") {
    operations = operations
      .map((op) => toUpdate(op, nodes))
      .filter((op) => op.type === "suggest_update" && op.id);
  } else if (decision === "conflict") {
    operations = operations.filter((op) => op.type === "conflict");
  } else if (decision === "related" || decision === "suggested") {
    operations = operations.filter((op) => op.type === "suggest_memory" || op.type === "add_memory");
  }

  if (decision !== "not_remembered" && decision !== "duplicate" && operations.length === 0) {
    decision = "not_remembered";
  }
  const modelReason = decision === stated ? cleanReason(parsed?.reason) : "";
  const reason = modelReason || DEFAULT_REASONS[decision];
  operations = operations.map((op) => ({ ...op, reason: op.reason || reason }));
  return { decision, reason, operations };
}

function toUpdate(op, nodes) {
  const next = {
    ...op,
    type: "suggest_update",
    id: op.id || op.existingMemoryId || "",
    newContent: op.newContent || op.content || ""
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
  return reason;
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
