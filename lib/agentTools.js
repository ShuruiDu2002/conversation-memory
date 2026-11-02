/**
 * Read-only tools for the chat agent.
 * Nothing here creates, edits, moves, or deletes a memory.
 */

import { retrieveMemories } from "@/lib/retrieve";
import { getChildren } from "@/lib/tree";

const TEXT_LIMIT = 700;
const OUTLINE_LIMIT = 3500;
const HISTORY_LIMIT = 4;

export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_memory",
      description:
        "Search confirmed memories about the user. Returns titles and content, not the user's original words.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          thought: {
            type: "string",
            description: "one short sentence: why you are calling this tool"
          },
          query: { type: "string", description: "What to look up about the user." },
          k: { type: "integer", description: "How many memories to return. Defaults to 4." }
        },
        required: ["thought", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_memory_outline",
      description:
        "List the category tree. Confirmed memories are included. Inferred memories are listed with their state so you can inspect them. Suggested, conflicting, and outdated memories are omitted.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          thought: {
            type: "string",
            description: "one short sentence: why you are calling this tool"
          }
        },
        required: ["thought"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_memory_details",
      description:
        "Read one confirmed or inferred memory, including the user's original words in sourceText. Use this when explaining why something is believed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          thought: {
            type: "string",
            description: "one short sentence: why you are calling this tool"
          },
          id: { type: "string", description: "Memory id from search_memory or get_memory_outline." }
        },
        required: ["thought", "id"]
      }
    }
  }
];

export async function runTool(name, args, nodes, apiKey) {
  try {
    const parsed = parseArgs(args);
    if (!parsed) return { error: "Arguments must be a JSON object." };
    if (typeof parsed.thought !== "string" || !parsed.thought.trim()) {
      return { error: "thought is required." };
    }
    const list = Array.isArray(nodes) ? nodes : [];
    if (name === "search_memory") return clipResult(await searchMemory(parsed, list, apiKey));
    if (name === "get_memory_outline") return clipResult(outlineText(list));
    if (name === "get_memory_details") return clipResult(memoryDetails(parsed, list));
    return { error: "Unknown tool." };
  } catch (error) {
    console.error("Agent tool failed", name, error?.message || error);
    return { error: "Tool failed." };
  }
}

async function searchMemory(args, nodes, apiKey) {
  if (typeof args.query !== "string" || !args.query.trim()) {
    return { error: "query is required." };
  }
  let k = args.k == null ? 4 : Number(args.k);
  if (!Number.isFinite(k)) k = 4;
  k = Math.min(8, Math.max(1, Math.round(k)));
  const hits = await retrieveMemories({
    query: args.query.trim(),
    nodes,
    k,
    apiKey
  });
  return hits.map((hit) => {
    const node = nodes.find((item) => item.id === hit.id);
    return {
      id: hit.id,
      title: hit.title,
      content: clip(hit.content, TEXT_LIMIT),
      score: Number(Number(hit.score || 0).toFixed(3)),
      state: node?.state || "confirmed"
    };
  });
}

function outlineText(nodes) {
  const visible = new Set();
  for (const node of nodes) {
    if (!readableMemory(node) && !(node.type === "memory" && node.state === "inferred")) continue;
    visible.add(node.id);
    let parentId = node.parentId;
    const seen = new Set([node.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      visible.add(parentId);
      parentId = nodes.find((item) => item.id === parentId)?.parentId || null;
    }
  }

  const lines = walkOutline(nodes, null, 0, visible);
  return clip(lines.length ? lines.join("\n") : "(no confirmed memories)", OUTLINE_LIMIT);
}

function walkOutline(nodes, parentId, depth, visible) {
  const lines = [];
  for (const child of getChildren(nodes, parentId)) {
    if (!visible.has(child.id)) continue;
    const mark = child.type === "memory" && child.state !== "confirmed" ? ` [${child.state}]` : "";
    lines.push(`${"  ".repeat(depth)}- ${child.title}${mark} (id: ${child.id})`);
    if (child.type === "category") lines.push(...walkOutline(nodes, child.id, depth + 1, visible));
  }
  return lines;
}

function memoryDetails(args, nodes) {
  if (typeof args.id !== "string" || !args.id.trim()) return { error: "id is required." };
  const node = nodes.find((item) => item.id === args.id);
  if (!node || node.type !== "memory") return { error: "Unknown memory." };
  if (node.state !== "confirmed" && node.state !== "inferred") {
    return { error: "Memory is not confirmed." };
  }
  const history = Array.isArray(node.history) ? node.history.slice(-HISTORY_LIMIT) : [];
  return {
    id: node.id,
    title: node.title,
    content: clip(node.content, TEXT_LIMIT),
    state: node.state,
    origin: node.origin || "",
    sourceText: clip(node.sourceText || "", TEXT_LIMIT),
    createdAt: node.createdAt || "",
    history: history.map((entry) => ({
      at: entry.at,
      content: clip(entry.content, 240),
      reason: clip(entry.reason, 160)
    }))
  };
}

function readableMemory(node) {
  return node?.type === "memory" && node.state === "confirmed";
}

function parseArgs(args) {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return args && typeof args === "object" ? args : null;
}

function clip(value, max) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function clipResult(result) {
  if (typeof result === "string") return clip(result, OUTLINE_LIMIT);
  return result;
}
