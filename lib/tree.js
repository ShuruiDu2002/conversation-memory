/**
 * Helpers for the memory topic tree.
 * Stored as a flat array of nodes with parentId pointers.
 */

import { memoryDefaults } from "@/lib/models";

export function getChildren(nodes, parentId) {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getNode(nodes, id) {
  const found = nodes.find((node) => node.id === id);
  return found ? memoryDefaults(found) : null;
}

export function getAncestors(nodes, id) {
  const ancestors = [];
  let current = getNode(nodes, id);
  while (current?.parentId) {
    current = getNode(nodes, current.parentId);
    if (!current) break;
    ancestors.unshift(current);
  }
  return ancestors;
}

export function getPathTitles(nodes, id) {
  const node = getNode(nodes, id);
  if (!node) return [];
  return [...getAncestors(nodes, id).map((item) => item.title), node.title];
}

export function countMemories(nodes, id) {
  const node = getNode(nodes, id);
  if (!node) return 0;
  let count = node.type === "memory" ? 1 : 0;
  for (const child of getChildren(nodes, id)) {
    count += countMemories(nodes, child.id);
  }
  return count;
}

export function countAllMemories(nodes) {
  return nodes.filter((node) => node.type === "memory").length;
}

export function countCategories(nodes) {
  return nodes.filter((node) => node.type === "category").length;
}

export function collectDescendants(nodes, id) {
  const ids = [];
  const walk = (parentId) => {
    for (const child of getChildren(nodes, parentId)) {
      ids.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return ids;
}

export function deleteSubtree(nodes, id) {
  const remove = new Set([id, ...collectDescendants(nodes, id)]);
  return nodes.filter((node) => !remove.has(node.id));
}

export function memoriesForConversation(nodes, conversationId) {
  return nodes.filter(
    (node) => node.sourceConversationId === conversationId && node.type === "memory"
  );
}

export function recentUpdates(nodes, limit = 5) {
  return [...nodes]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

/**
 * Walk or create category nodes for a path like ["Education", "Northwestern"].
 */
export function ensurePath(nodes, path = [], provenance = {}) {
  const titles = (path || []).map((part) => String(part).trim()).filter(Boolean);
  let parentId = null;
  let next = [...nodes];
  const createdIds = [];

  for (const title of titles) {
    const existing = next.find(
      (node) =>
        node.parentId === parentId &&
        node.type === "category" &&
        node.title.toLowerCase() === title.toLowerCase()
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created = memoryDefaults({
      id: `cat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      type: "category",
      parentId,
      content: "",
      state: "suggested",
      confidence: "medium",
      origin: "inferred",
      confidenceReason: "Created so a new memory had a place in the graph.",
      sourceMessageId: provenance.sourceMessageId || null,
      sourceText: provenance.sourceText || null,
      sourceConversationId: provenance.sourceConversationId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: []
    });
    next.push(created);
    createdIds.push(created.id);
    parentId = created.id;
  }

  return { nodes: next, parentId, createdIds };
}

export function formatOutline(nodes, parentId = null, depth = 0) {
  const lines = [];
  for (const child of getChildren(nodes, parentId)) {
    const indent = "  ".repeat(depth);
    const body = child.content ? `: ${child.content}` : "";
    lines.push(
      `${indent}- [${child.type}/${child.state || "confirmed"}] ${child.title}${body} (id: ${child.id})`
    );
    lines.push(formatOutline(nodes, child.id, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

export function searchTree(nodes, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { matchIds: new Set(), visibleIds: null, conversationIds: [], messageIds: [] };
  }

  const matchIds = new Set();
  const conversationIds = new Set();
  const messageIds = new Set();

  for (const node of nodes) {
    const haystack = `${node.title} ${node.content} ${node.sourceText || ""}`.toLowerCase();
    if (haystack.includes(q)) {
      matchIds.add(node.id);
      if (node.sourceConversationId) conversationIds.add(node.sourceConversationId);
      if (node.sourceMessageId) messageIds.add(node.sourceMessageId);
    }
  }

  const visibleIds = new Set(matchIds);
  for (const id of matchIds) {
    for (const ancestor of getAncestors(nodes, id)) visibleIds.add(ancestor.id);
    for (const descendant of collectDescendants(nodes, id)) visibleIds.add(descendant);
  }

  return {
    matchIds,
    visibleIds,
    conversationIds: [...conversationIds],
    messageIds: [...messageIds]
  };
}

export function groupTimeline(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const day = (node.createdAt || "").slice(0, 10);
    if (!day) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(node);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }));
}

/**
 * Apply LLM / heuristic operations.
 * New long-term facts are added as `suggested` so the user can confirm them.
 */
export function applyOperations(nodes, operations, provenance = {}) {
  let next = [...nodes];
  const conflicts = [];
  const suggestions = [];
  const newIds = [];

  for (const raw of operations || []) {
    const op = raw || {};
    const type = op.type || (op.fact ? "add_memory" : null);

    if (type === "conflict") {
      const existing =
        getNode(next, op.existingMemoryId) ||
        next.find(
          (node) =>
            node.type === "memory" &&
            node.content &&
            op.existingContent &&
            node.content.toLowerCase().includes(String(op.existingContent).toLowerCase().slice(0, 40))
        );
      if (existing) {
        next = next.map((node) =>
          node.id === existing.id ? { ...node, state: "conflicting" } : node
        );
      }
      conflicts.push({
        type: "conflict",
        existingId: existing?.id || op.existingMemoryId || null,
        existingContent: existing?.content || op.existingContent || "",
        existingTitle: existing?.title || "Existing memory",
        newContent: op.newContent || op.content || op.fact || "",
        sourceMessageId: provenance.sourceMessageId || null,
        sourceText: provenance.sourceText || null,
        sourceConversationId: provenance.sourceConversationId || null,
        reason: op.reason || "New statement may conflict with an existing memory."
      });
      continue;
    }

    if (type === "suggest_update" || type === "update_suggestion") {
      const existingId = op.id || op.existingMemoryId;
      const existing = getNode(next, existingId);
      suggestions.push({
        type: "update",
        existingId,
        title: op.title || existing?.title,
        fromContent: op.existingContent || existing?.content,
        toContent: op.newContent || op.content,
        reason: op.reason || "A later conversation may have changed this."
      });
      continue;
    }

    if (type === "create_category") {
      const path = op.path || [op.category, op.topic].filter(Boolean);
      const ensured = ensurePath(next, path, provenance);
      next = ensured.nodes;
      newIds.push(...ensured.createdIds);
      continue;
    }

    if (type === "add_memory" || type === "suggest_memory") {
      const path = op.path || [op.category, op.topic].filter(Boolean);
      const ensured = ensurePath(next, path, provenance);
      next = ensured.nodes;
      newIds.push(...ensured.createdIds);
      const content = op.content || op.fact || "";
      const title = op.title || op.topic || summarizeTitle(content);
      const duplicate = next.find(
        (node) =>
          node.parentId === ensured.parentId &&
          node.type === "memory" &&
          node.content.trim().toLowerCase() === content.trim().toLowerCase()
      );
      if (duplicate || !content.trim()) continue;
      const created = memoryDefaults({
        id: `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        type: "memory",
        parentId: ensured.parentId,
        content,
        state: op.state || "suggested",
        confidence: op.confidence || "medium",
        confidenceReason:
          op.confidenceReason ||
          (op.origin === "inferred"
            ? "Inferred from conversation rather than stated as a fact."
            : "The user stated this, but it has not been confirmed in the model yet."),
        origin: op.origin || "stated",
        sourceMessageId: provenance.sourceMessageId || null,
        sourceText: provenance.sourceText || op.sourceText || null,
        sourceConversationId: provenance.sourceConversationId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: []
      });
      next.push(created);
      newIds.push(created.id);
      suggestions.push({
        type: "remember",
        nodeId: created.id,
        title: created.title,
        content: created.content,
        path,
        reason: op.reason || "This looks like something worth remembering about you."
      });
      continue;
    }

    if (type === "update_memory") {
      next = next.map((node) => {
        if (node.id !== op.id) return node;
        return withHistory(node, op.content || node.content, op.reason || "Updated from a later conversation.");
      });
      continue;
    }

    if (type === "move") {
      const ensured = ensurePath(next, op.path || [], provenance);
      next = ensured.nodes.map((node) =>
        node.id === op.id
          ? {
              ...node,
              parentId: ensured.parentId,
              updatedAt: new Date().toISOString(),
              history: [
                ...(node.history || []),
                { at: node.updatedAt, content: node.content, reason: op.reason || "Moved in the user model." }
              ]
            }
          : node
      );
      newIds.push(...ensured.createdIds);
      continue;
    }

    if (type === "merge") {
      const source = getNode(next, op.sourceId);
      const target = getNode(next, op.targetId);
      if (!source || !target) continue;
      next = next.map((node) =>
        node.parentId === source.id ? { ...node, parentId: target.id, updatedAt: new Date().toISOString() } : node
      );
      next = deleteSubtree(next, source.id);
    }
  }

  return { nodes: next, conflicts, suggestions, newIds };
}

function withHistory(node, content, reason) {
  if (content === node.content) return node;
  return {
    ...node,
    content,
    updatedAt: new Date().toISOString(),
    history: [...(node.history || []), { at: node.updatedAt, content: node.content, reason }]
  };
}

function summarizeTitle(content) {
  const trimmed = content.trim();
  if (trimmed.length <= 32) return trimmed || "Memory";
  return `${trimmed.slice(0, 32).trim()}…`;
}

export function updateNodeContent(nodes, id, content, reason = "Edited by the user.") {
  return nodes.map((node) => {
    if (node.id !== id) return node;
    if (content === node.content) return node;
    return withHistory({ ...node, state: node.state === "suggested" ? "confirmed" : node.state }, content, reason);
  });
}

export function updateNodeTitle(nodes, id, title) {
  return nodes.map((node) =>
    node.id === id ? { ...node, title, updatedAt: new Date().toISOString() } : node
  );
}

export function setNodeState(nodes, id, state) {
  return nodes.map((node) =>
    node.id === id ? { ...node, state, updatedAt: new Date().toISOString() } : node
  );
}
