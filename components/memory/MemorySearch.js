"use client";

import { useMemo } from "react";
import { useAppState } from "@/context/AppContext";
import { countMemories, searchTree } from "@/lib/tree";

export default function MemorySearch() {
  const { searchQuery, setSearchQuery, nodes, setSelectedNodeId, setMemoryView } =
    useAppState();
  const result = useMemo(() => searchTree(nodes, searchQuery), [nodes, searchQuery]);

  const matchCount = result.matchIds.size;
  const memoryHits = nodes.filter((node) => result.matchIds.has(node.id) && node.type === "memory").length;

  return (
    <div className="search-wrap">
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search the user model — Northwestern, HCI, courses…"
        aria-label="Search memories"
      />
      {searchQuery.trim() && (
        <div className="search-stats">
          <span>{memoryHits} memories</span>
          <span>{result.conversationIds.length} conversations</span>
          <span>{result.messageIds.length} source messages</span>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              const first = nodes.find((node) => result.matchIds.has(node.id));
              if (first) {
                setSelectedNodeId(first.id);
                setMemoryView("graph");
              }
            }}
          >
            Highlight in graph
          </button>
        </div>
      )}
      {searchQuery.trim() && matchCount > 0 && (
        <div className="search-paths">
          {nodes
            .filter((node) => result.matchIds.has(node.id))
            .slice(0, 6)
            .map((node) => (
              <button key={node.id} type="button" onClick={() => setSelectedNodeId(node.id)}>
                {node.title}
                {node.type === "category" ? ` · ${countMemories(nodes, node.id)}` : ""}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
