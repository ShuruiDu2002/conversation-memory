"use client";

import { useAppState } from "@/context/AppContext";

export default function SuggestionCard() {
  const {
    pendingSuggestion,
    memoryDecision,
    confirmMemory,
    rejectSuggestion,
    acceptUpdate,
    setSelectedNodeId,
    setPendingSuggestion
  } = useAppState();
  if (!pendingSuggestion) return null;

  if (pendingSuggestion.type === "update") {
    return (
      <div className="conflict-card suggestion-card">
        <h3>{memoryDecision?.decision === "refinement" ? "Add detail to an existing memory" : "Possible memory update"}</h3>
        <p>
          {memoryDecision?.decision === "refinement"
            ? "This makes an existing memory more specific:"
            : "I think this part of the model may have changed:"}
        </p>
        <p>
          <strong>{pendingSuggestion.fromContent}</strong>
          <span className="arrow"> → </span>
          <strong>{pendingSuggestion.toContent}</strong>
        </p>
        {pendingSuggestion.reason && pendingSuggestion.reason !== memoryDecision?.reason && (
          <p className="muted">{pendingSuggestion.reason}</p>
        )}
        <div className="conflict-actions">
          <button className="primary-btn" type="button" onClick={() => acceptUpdate(pendingSuggestion)}>
            Accept
          </button>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              if (pendingSuggestion.existingId) setSelectedNodeId(pendingSuggestion.existingId);
              setPendingSuggestion(null);
            }}
          >
            Edit
          </button>
          <button className="text-btn" type="button" onClick={() => setPendingSuggestion(null)}>
            Ignore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="conflict-card suggestion-card">
      <h3>AI memory suggestion</h3>
      <p>
        Would you like me to remember <strong>{pendingSuggestion.title}</strong>?
      </p>
      <p className="muted">{pendingSuggestion.content}</p>
      {pendingSuggestion.reason && pendingSuggestion.reason !== memoryDecision?.reason && (
        <p className="muted">{pendingSuggestion.reason}</p>
      )}
      <div className="conflict-actions">
        <button
          className="primary-btn"
          type="button"
          onClick={() => confirmMemory(pendingSuggestion.nodeId)}
        >
          Remember
        </button>
        <button className="ghost-btn" type="button" onClick={() => rejectSuggestion(pendingSuggestion)}>
          Don&apos;t remember
        </button>
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            if (pendingSuggestion.nodeId) setSelectedNodeId(pendingSuggestion.nodeId);
          }}
        >
          Review
        </button>
      </div>
    </div>
  );
}
