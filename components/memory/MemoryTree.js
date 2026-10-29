"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/context/AppContext";
import { countMemories, getChildren, searchTree } from "@/lib/tree";

export default function MemoryTree() {
  const { nodes, selectedNodeId, setSelectedNodeId, searchQuery } = useAppState();
  const roots = getChildren(nodes, null);
  const { matchIds, visibleIds } = useMemo(
    () => searchTree(nodes, searchQuery),
    [nodes, searchQuery]
  );

  const [expanded, setExpanded] = useState(() => new Set(nodes.filter((n) => n.type === "category").map((n) => n.id)));

  useEffect(() => {
    if (!visibleIds) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [visibleIds]);

  if (roots.length === 0) {
    return <div className="empty">No memories yet. Chat, or add one manually.</div>;
  }

  return (
    <div className="tree">
      {roots.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          nodes={nodes}
          depth={0}
          expanded={expanded}
          setExpanded={setExpanded}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          matchIds={matchIds}
          visibleIds={visibleIds}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  nodes,
  depth,
  expanded,
  setExpanded,
  selectedNodeId,
  setSelectedNodeId,
  matchIds,
  visibleIds
}) {
  const children = getChildren(nodes, node.id);
  const isOpen = expanded.has(node.id);
  const count = countMemories(nodes, node.id);
  const hidden = visibleIds && !visibleIds.has(node.id);
  if (hidden) return null;

  const classes = [
    "tree-row",
    selectedNodeId === node.id ? "selected" : "",
    matchIds.has(node.id) ? "match" : "",
    visibleIds && !matchIds.has(node.id) ? "dim" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={classes} style={{ paddingLeft: 8 + depth * 14 }}>
        {children.length > 0 ? (
          <button
            type="button"
            className="chevron"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => {
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              });
            }}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="chevron">·</span>
        )}
        <button type="button" className="tree-main" onClick={() => setSelectedNodeId(node.id)}>
          <div className="tree-title">
            <span className={`state-dot ${node.state || "confirmed"}`}>
              {node.state === "conflicting" ? "⚠" : node.state === "outdated" ? "○" : node.state === "confirmed" ? "●" : "◐"}
            </span>{" "}
            {node.title}
          </div>
          {node.content && node.type === "category" && (
            <div className="tree-desc">{node.content}</div>
          )}
        </button>
        <div className="tree-count">{count}</div>
      </div>
      {isOpen &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            nodes={nodes}
            depth={depth + 1}
            expanded={expanded}
            setExpanded={setExpanded}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            matchIds={matchIds}
            visibleIds={visibleIds}
          />
        ))}
    </div>
  );
}
