function debugLog(...args) {
  if (process.env.DEBUG_PROMPTS === "true") console.log(...args);
}

/**
 * After the user confirms a memory filed under a brand-new category, ask
 * whether older memories belong there too. Nothing is written here.
 */
export async function POST(request) {
  const body = await request.json();
  const category = body.category || {};
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const outline = body.outline || "(empty tree)";
  const confirmedMemoryId = body.confirmedMemoryId || "";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!category.id || !category.title) {
    return Response.json({ mode: "demo", moves: [] });
  }

  if (!apiKey) {
    const moves = heuristicMoves(nodes, category, confirmedMemoryId);
    console.log("[reorganize] mode=demo (no OPENAI_API_KEY)");
    debugLog("[reorganize] heuristic moves:\n", JSON.stringify(moves, null, 2));
    return Response.json({ mode: "demo", moves });
  }

  const userPrompt = [
    `New category just confirmed: "${category.title}" (id: ${category.id}).`,
    confirmedMemoryId ? `Memory just confirmed, already under that category (do not move it): ${confirmedMemoryId}` : "",
    "",
    "Current user model:",
    outline,
    "",
    "Do any existing memories belong under this new category?"
  ]
    .filter((line) => line !== "")
    .join("\n");

  console.log("[reorganize] mode=live model=gpt-4o-mini");
  debugLog("[reorganize] system prompt:\n", REORGANIZE_PROMPT);
  debugLog("[reorganize] user prompt:\n", userPrompt);

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
          { role: "system", content: REORGANIZE_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[reorganize] OpenAI error", response.status, errText);
      const moves = heuristicMoves(nodes, category, confirmedMemoryId);
      return Response.json({ mode: "demo", moves });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    debugLog("[reorganize] raw model output:\n", raw);
    const parsed = JSON.parse(raw);
    const moves = normalizeMoves(parsed, nodes, category, confirmedMemoryId);
    debugLog("[reorganize] normalized moves:\n", JSON.stringify(moves, null, 2));
    return Response.json({ mode: "live", moves });
  } catch (error) {
    console.error("[reorganize] route failed", error);
    const moves = heuristicMoves(nodes, category, confirmedMemoryId);
    return Response.json({ mode: "demo", moves });
  }
}

const REORGANIZE_PROMPT = `You reorganize an existing user model after the user confirms a memory whose parent category was created in that same turn.

Do any existing memories belong under this new category?

Example: a new "Health & Diet" category should pull in an existing "Nut Allergy" memory that currently sits under "Interests", because an allergy is a lasting health fact, not an interest.

Rules:
- Propose a move only when an existing memory clearly belongs under the new category.
- Interests are things the user enjoys. Do not pull hobbies into Health & Diet.
- Lasting constraints and health facts (allergies, dietary restrictions, medical conditions, accessibility needs) belong under a health or diet category.
- Do not move the memory that was just confirmed.
- Do not move categories. Do not create categories. Do not merge nodes.
- Use only memory ids from the outline.

Return JSON:
{
  "moves": [
    { "id": "existing memory id", "title": "Nut Allergy" }
  ]
}

Use an empty moves array when nothing else belongs under the new category.`;

function normalizeMoves(parsed, nodes, category, confirmedMemoryId) {
  const raw = Array.isArray(parsed?.moves) ? parsed.moves : [];
  const seen = new Set();
  const moves = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item : item?.id || item?.memoryId;
    if (!id || seen.has(id) || id === confirmedMemoryId) continue;
    const described = describeMove(nodes, id, category);
    if (!described) continue;
    seen.add(id);
    moves.push(described);
  }
  return moves;
}

function describeMove(nodes, id, category) {
  const memory = nodes.find((node) => node.id === id && node.type === "memory");
  if (!memory || memory.parentId === category.id) return null;
  const from = nodes.find((node) => node.id === memory.parentId);
  return {
    id: memory.id,
    title: memory.title,
    from: from?.title || "the top",
    to: category.title
  };
}

function heuristicMoves(nodes, category, confirmedMemoryId) {
  if (!/health|diet|allerg|medical|accessib/i.test(category.title || "")) return [];
  const moves = [];
  for (const node of nodes) {
    if (node.type !== "memory" || node.id === confirmedMemoryId || node.parentId === category.id) continue;
    if (!/allerg|dietary|gluten|medical condition|accessib/i.test(`${node.title} ${node.content}`)) continue;
    const described = describeMove(nodes, node.id, category);
    if (described) moves.push(described);
  }
  return moves;
}
