/**
 * Hierarchical layout for the memory graph.
 * ME sits on the left; categories and memories branch to the right.
 * Collapsing a node hides its descendants without destroying them.
 */

import { ME_ID } from "@/lib/models";
import { collectDescendants, getAncestors, getChildren } from "@/lib/tree";

export const NODE_W = 158;
export const NODE_H = 54;
const X_GAP = 52;
const Y_GAP = 14;

export function layoutMemoryGraph(nodes, { collapsedIds = new Set(), focusRootId = null } = {}) {
  const visible = visibleSet(nodes, focusRootId);

  function childrenOf(parentId) {
    const realParent = parentId === ME_ID ? null : parentId;
    return getChildren(nodes, realParent).filter((node) => visible.has(node.id));
  }

  function subtreeHeight(id) {
    if (id !== ME_ID && collapsedIds.has(id)) return NODE_H;
    const kids = childrenOf(id);
    if (!kids.length) return NODE_H;
    return kids.reduce((sum, kid) => sum + subtreeHeight(kid.id), 0) + Y_GAP * (kids.length - 1);
  }

  const positions = new Map();

  function place(id, x, y) {
    const kids = id !== ME_ID && collapsedIds.has(id) ? [] : childrenOf(id);
    const height = subtreeHeight(id);
    positions.set(id, { x, y: y + Math.max(0, (height - NODE_H) / 2) });
    let cursor = y;
    for (const kid of kids) {
      const h = subtreeHeight(kid.id);
      place(kid.id, x + NODE_W + X_GAP, cursor);
      cursor += h + Y_GAP;
    }
  }

  place(ME_ID, 20, 16);
  return { positions, size: { width: 0, height: subtreeHeight(ME_ID) + 40 } };
}

function visibleSet(nodes, focusRootId) {
  if (!focusRootId || focusRootId === ME_ID) {
    return new Set(nodes.map((node) => node.id));
  }
  const keep = new Set([focusRootId, ...collectDescendants(nodes, focusRootId)]);
  for (const ancestor of getAncestors(nodes, focusRootId)) keep.add(ancestor.id);
  return keep;
}

export function graphEdges(nodes, positions) {
  const edges = [];
  for (const node of nodes) {
    if (!positions.has(node.id)) continue;
    const parentId = node.parentId || ME_ID;
    if (!positions.has(parentId) && parentId !== ME_ID) continue;
    if (parentId === ME_ID && !positions.has(ME_ID)) continue;
    edges.push({
      id: `e-${parentId}-${node.id}`,
      source: parentId,
      target: node.id
    });
  }
  return edges;
}
