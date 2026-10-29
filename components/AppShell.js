"use client";

import { AppProvider, useAppState } from "@/context/AppContext";
import SessionList from "@/components/sessions/SessionList";
import ChatPanel from "@/components/chat/ChatPanel";
import MemoryDashboard from "@/components/memory/MemoryDashboard";

function ShellLayout() {
  const { apiMode, modelStats, exploreModel, graphExpanded } = useAppState();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            conversation-memory <span>/ research prototype</span>
          </div>
          <div className="brand-sub">What does the AI currently know?</div>
        </div>
        <button type="button" className="model-chip" onClick={exploreModel}>
          <div className="model-chip-kicker">AI user model</div>
          <div className="model-chip-title">
            {modelStats.memories} memories · {modelStats.categories} categories
          </div>
          <div className="model-chip-meta">Explore my memory</div>
        </button>
        <div className="topbar-meta">
          <span className="pill">{apiMode === "live" ? "OpenAI" : "Demo mode"}</span>
        </div>
      </header>
      <div className={`workspace ${graphExpanded ? "graph-expanded" : ""}`}>
        <SessionList />
        <ChatPanel />
        <MemoryDashboard />
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <AppProvider>
      <ShellLayout />
    </AppProvider>
  );
}
