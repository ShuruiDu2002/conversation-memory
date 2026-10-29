/**
 * Data models for conversation-memory (V2).
 * Everything lives in React state — no database.
 *
 * MemoryNode (hierarchical user model):
 * {
 *   id, title,
 *   type: "category" | "memory",
 *   parentId: string | null,
 *   content: string,
 *   state: "confirmed" | "suggested" | "inferred" | "conflicting" | "outdated",
 *   confidence: "high" | "medium" | "low",
 *   confidenceReason: string,
 *   origin: "stated" | "inferred" | "manual",
 *   sourceMessageId, sourceText, sourceConversationId,
 *   createdAt, updatedAt,
 *   history: Array<{ at, content, reason }>
 * }
 *
 * Conversation / ConversationMessage are unchanged; the link to memory is
 * sourceConversationId + sourceMessageId on each node.
 */

export const ME_ID = "me";

export const MEMORY_STATES = ["confirmed", "suggested", "inferred", "conflicting", "outdated"];

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createMessage(role, content) {
  return {
    id: createId("msg"),
    role,
    content,
    timestamp: nowIso()
  };
}

export function createConversation(title = "New conversation") {
  return {
    id: createId("convo"),
    title,
    createdAt: nowIso(),
    messages: []
  };
}

export function createMemoryNode({
  title,
  type = "memory",
  parentId = null,
  content = "",
  state = "confirmed",
  confidence = "high",
  confidenceReason = "",
  origin = "manual",
  sourceMessageId = null,
  sourceText = null,
  sourceConversationId = null
}) {
  const timestamp = nowIso();
  return {
    id: createId(type === "category" ? "cat" : "mem"),
    title,
    type,
    parentId,
    content,
    state,
    confidence,
    confidenceReason,
    origin,
    sourceMessageId,
    sourceText,
    sourceConversationId,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: []
  };
}

export function memoryDefaults(node = {}) {
  return {
    state: "confirmed",
    confidence: "high",
    confidenceReason: "",
    origin: "stated",
    history: [],
    ...node
  };
}
