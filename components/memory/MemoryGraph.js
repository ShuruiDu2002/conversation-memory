"use client";

import { useCallback, useMemo, useState } from "react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppState } from "@/context/AppContext";
import { ME_ID } from "@/lib/models";
import { countMemories, searchTree } from "@/lib/tree";
import { graphEdges, layoutMemoryGraph, NODE_H, NODE_W } from "@/lib/graphLayout";
import GraphNode from "@/components/memory/GraphNode";

const nodeTypes = { memoryNode: GraphNode };

export default function MemoryGraph() {
  const { nodes, selectedNodeId, setSelectedNodeId, searchQuery, freshIds, timelineDay } =
    useAppState();
  const [collapsedIds] = useState(new Set());
  const [focusRootId, setFocusRootId] = useState(null);
  const { matchIds } = useMemo(() => searchTree(nodes, searchQuery), [nodes, searchQuery]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const { positions } = layoutMemoryGraph(nodes, { collapsedIds, focusRootId });
    const meData = {
      id: ME_ID,
      position: positions.get(ME_ID) || { x: 20, y: 20 },
      type: "memoryNode",
      data: {
        title: "ME",
        isMe: true,
        meta: `${nodes.filter((n) => n.type === "memory").length} memories`,
        selected: selectedNodeId === ME_ID,
        match: false,
        dim: Boolean(matchIds.size || timelineDay),
        fresh: false
      },
      style: { width: NODE_W, height: NODE_H }
    };

    const graphNodes = nodes
      .filter((node) => positions.has(node.id))
      .map((node) => {
        const count = countMemories(nodes, node.id);
        const dayMatch = timelineDay && (node.createdAt || "").slice(0, 10) === timelineDay;
        const isMatch = matchIds.has(node.id) || dayMatch;
        return {
          id: node.id,
          position: positions.get(node.id),
          type: "memoryNode",
          data: {
            title: node.title,
            nodeType: node.type,
            state: node.state || "confirmed",
            meta: node.type === "category" ? `${count}` : node.state || "confirmed",
            subtitle: node.content || node.title,
            selected: selectedNodeId === node.id,
            match: isMatch,
            dim: (matchIds.size > 0 && !matchIds.has(node.id) && !dayMatch) || (timelineDay && !dayMatch),
            fresh: freshIds.includes(node.id)
          },
          style: { width: NODE_W, height: NODE_H }
        };
      });

    const edges = graphEdges(nodes, positions).map((edge) => ({
      ...edge,
      animated: freshIds.includes(edge.target),
      style: { stroke: "#c5bcae", strokeWidth: 1.2 }
    }));

    return { flowNodes: [meData, ...graphNodes], flowEdges: edges };
  }, [nodes, collapsedIds, focusRootId, selectedNodeId, matchIds, freshIds, timelineDay]);

  const onNodeClick = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onNodeDoubleClick = useCallback((_event, node) => {
    setFocusRootId((current) => (current === node.id ? null : node.id));
  }, []);

  return (
    <div className="graph-canvas">
      {focusRootId && (
        <button type="button" className="graph-reset" onClick={() => setFocusRootId(null)}>
          Show full model
        </button>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll
      >
        <Background color="#e4ddd0" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
