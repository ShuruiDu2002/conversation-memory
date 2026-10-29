"use client";

import dynamic from "next/dynamic";
import { useAppState } from "@/context/AppContext";
import MemorySearch from "@/components/memory/MemorySearch";
import MemoryTree from "@/components/memory/MemoryTree";
import MemoryDetail from "@/components/memory/MemoryDetail";
import ConflictCard from "@/components/memory/ConflictCard";
import SuggestionCard from "@/components/memory/SuggestionCard";
import CreateMemoryForm from "@/components/memory/CreateMemoryForm";
import MemoryTimeline from "@/components/memory/MemoryTimeline";

const MemoryGraph = dynamic(() => import("@/components/memory/MemoryGraph"), {
  ssr: false,
  loading: () => <div className="empty">Drawing the user model…</div>
});

const VIEWS = [
  { id: "graph", label: "Graph" },
  { id: "list", label: "List" },
  { id: "timeline", label: "Timeline" }
];

const DECISION_LABEL = {
  suggested: "Suggested",
  related: "Separate memory",
  refinement: "More detail",
  update: "Possible update",
  conflict: "Possible contradiction",
  duplicate: "Already remembered",
  not_remembered: "Not remembered"
};

function decisionLabel(decision) {
  return DECISION_LABEL[decision] || "This turn";
}

export default function MemoryDashboard() {
  const {
    isExtracting,
    creatingMemory,
    setCreatingMemory,
    pendingConflict,
    pendingSuggestion,
    memoryDecision,
    memoryView,
    setMemoryView,
    graphExpanded,
    setGraphExpanded
  } = useAppState();

  return (
    <aside className="panel memory-panel">
      <div className="panel-header">
        <h2>Memory graph</h2>
        <div className="header-actions">
          <button className="text-btn" type="button" onClick={() => setCreatingMemory((v) => !v)}>
            {creatingMemory ? "Cancel" : "+ Add"}
          </button>
          <button className="text-btn" type="button" onClick={() => setGraphExpanded((v) => !v)}>
            {graphExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      <div className="view-toggle">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={memoryView === view.id ? "active" : ""}
            onClick={() => setMemoryView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <MemorySearch />
      {isExtracting && <div className="extracting">Reconsidering what is worth remembering…</div>}
      {memoryDecision?.reason && (
        <div className="memory-decision">
          <div className="memory-decision-kicker">{decisionLabel(memoryDecision.decision)}</div>
          <p>{memoryDecision.reason}</p>
        </div>
      )}
      {pendingSuggestion && <SuggestionCard />}
      {pendingConflict && <ConflictCard />}
      {creatingMemory && <CreateMemoryForm />}
      <div className={`panel-body ${memoryView === "graph" ? "graph-body" : ""}`}>
        {memoryView === "graph" && <MemoryGraph key={String(graphExpanded)} />}
        {memoryView === "list" && <MemoryTree />}
        {memoryView === "timeline" && <MemoryTimeline />}
      </div>
      <MemoryDetail />
    </aside>
  );
}
