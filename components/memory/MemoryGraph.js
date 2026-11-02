"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppState } from "@/context/AppContext";
import { ME_ID } from "@/lib/models";
import { countMemories, getAncestors, searchTree } from "@/lib/tree";
import { graphEdges, layoutMemoryGraph, NODE_H, NODE_W } from "@/lib/graphLayout";
import GraphNode from "@/components/memory/GraphNode";

const nodeTypes = { memoryNode: GraphNode };
const INITIAL_FIT = { padding: 0.12, minZoom: 0.7, maxZoom: 1, duration: 0 };

function frameInitial(instance, nodes) {
  const { size } = layoutMemoryGraph(nodes, { collapsedIds: new Set(), focusRootId: null });
  const flow = document.querySelector(".graph-canvas .react-flow");
  const canvas = document.querySelector(".graph-canvas");
  const panelHeight = flow?.clientHeight || canvas?.clientHeight || 0;
  const tooTall = panelHeight > 0 && size.height > panelHeight / 0.7;
  if (!tooTall) {
    instance.fitView(INITIAL_FIT);
    return;
  }
  const firstLevel = nodes.filter((node) => !node.parentId).map((node) => ({ id: node.id }));
  instance.fitView({ ...INITIAL_FIT, nodes: [{ id: ME_ID }, ...firstLevel] });
}

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      type="button"
      className="graph-fit"
      onClick={() => fitView({ padding: 0.12, minZoom: 0.4, duration: 400 })}
    >
      Fit view
    </button>
  );
}

function MemoryGraphCanvas() {
  const { nodes, selectedNodeId, setSelectedNodeId, searchQuery, freshIds, timelineDay } =
    useAppState();
  const { getNode, getZoom, setCenter } = useReactFlow();
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [focusRootId, setFocusRootId] = useState(null);
  const [framed, setFramed] = useState(false);
  const pannedId = useRef(null);
  const { matchIds } = useMemo(() => searchTree(nodes, searchQuery), [nodes, searchQuery]);

  const toggleCollapsed = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const openIds = new Set();
    const consider = (id) => {
      if (!id || id === ME_ID) return;
      for (const ancestor of getAncestors(nodes, id)) {
        if (ancestor.type === "category") openIds.add(ancestor.id);
      }
    };
    consider(selectedNodeId);
    if (searchQuery.trim()) {
      for (const id of matchIds) consider(id);
    }
    if (!openIds.size) return;
    setCollapsedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of openIds) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedNodeId, searchQuery, matchIds, nodes]);

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
        const collapsed = collapsedIds.has(node.id);
        return {
          id: node.id,
          position: positions.get(node.id),
          type: "memoryNode",
          data: {
            title: node.title,
            nodeType: node.type,
            state: node.state || "confirmed",
            collapsed,
            onToggleCollapse: node.type === "category" ? () => toggleCollapsed(node.id) : undefined,
            meta:
              node.type === "category"
                ? collapsed
                  ? `${count} ${count === 1 ? "memory" : "memories"}`
                  : `${count}`
                : node.state || "confirmed",
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
      style: { stroke: "#d1d5db", strokeWidth: 1.2 }
    }));

    return { flowNodes: [meData, ...graphNodes], flowEdges: edges };
  }, [nodes, collapsedIds, focusRootId, selectedNodeId, matchIds, freshIds, timelineDay, toggleCollapsed]);

  const onInit = useCallback(
    (instance) => {
      frameInitial(instance, nodes);
      pannedId.current = selectedNodeId;
      setFramed(true);
    },
    [nodes, selectedNodeId]
  );

  useEffect(() => {
    if (!framed) return;
    if (pannedId.current === selectedNodeId) return;
    const node = getNode(selectedNodeId);
    if (!node) return;
    pannedId.current = selectedNodeId;
    setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
      zoom: getZoom(),
      duration: 400
    });
  }, [framed, selectedNodeId, flowNodes, getNode, getZoom, setCenter]);

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
      <FitViewButton />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll
      >
        <Background color="#e5e7eb" gap={22} size={1} />
        <Controls showInteractive={false} showFitView={false} />
      </ReactFlow>
    </div>
  );
}

export default function MemoryGraph() {
  return (
    <ReactFlowProvider>
      <MemoryGraphCanvas />
    </ReactFlowProvider>
  );
}
