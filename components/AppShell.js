"use client";

import { AppProvider, useAppState } from "@/context/AppContext";
import SessionList from "@/components/sessions/SessionList";
import ChatPanel from "@/components/chat/ChatPanel";
import MemoryDashboard from "@/components/memory/MemoryDashboard";

function ShellLayout() {
  const { chatMode, extractMode, resetDemo } = useAppState();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            conversation-memory <span>/ research prototype</span>
          </div>
          <div className="brand-sub">What does the AI currently know?</div>
        </div>
        <div className="topbar-meta">
          <button type="button" className="text-btn" onClick={resetDemo}>
            Reset demo
          </button>
          <span className="pill pill-status">Chat: {chatMode === "live" ? "live" : "demo"}</span>
          <span className="pill pill-status">Memory: {extractMode === "live" ? "live" : "fallback"}</span>
        </div>
      </header>
      <div className="workspace">
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
