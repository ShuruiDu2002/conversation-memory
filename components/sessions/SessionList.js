"use client";

import { formatDisplayDate, useAppState } from "@/context/AppContext";
import { memoriesForConversation } from "@/lib/tree";

export default function SessionList() {
  const { conversations, activeConversationId, setActiveConversationId, startNewChat, nodes } =
    useAppState();

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>Conversations</h2>
      </div>
      <div className="panel-body session-list">
        <button className="ghost-btn new-chat" type="button" onClick={startNewChat}>
          + New chat
        </button>
        {conversations.map((convo) => {
          const count = memoriesForConversation(nodes, convo.id).length;
          return (
            <button
              key={convo.id}
              type="button"
              className={`session-item ${convo.id === activeConversationId ? "active" : ""}`}
              onClick={() => setActiveConversationId(convo.id)}
            >
              <span className="session-title">{convo.title}</span>
              <span className="session-date">
                {formatDisplayDate(convo.createdAt)}
                {count
                  ? ` · ${count} memories`
                  : convo.messages.length
                    ? " · no long-term memories"
                    : ""}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
