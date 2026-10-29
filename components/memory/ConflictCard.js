"use client";

import { useAppState } from "@/context/AppContext";

export default function ConflictCard() {
  const { pendingConflict, resolveConflict } = useAppState();
  if (!pendingConflict) return null;

  return (
    <div className="conflict-card">
      <h3>Possible contradiction</h3>
      <p>I found two different statements:</p>
      <p>
        <strong>{pendingConflict.existingContent}</strong>
      </p>
      <p>
        <strong>{pendingConflict.newContent}</strong>
      </p>
      <p>Which is correct?</p>
      {pendingConflict.reason && <p className="muted">{pendingConflict.reason}</p>}
      <div className="conflict-actions">
        <button className="ghost-btn" type="button" onClick={() => resolveConflict("existing")}>
          Keep existing
        </button>
        <button className="primary-btn" type="button" onClick={() => resolveConflict("new")}>
          Use new
        </button>
        <button className="text-btn" type="button" onClick={() => resolveConflict("neither")}>
          Neither / Edit
        </button>
      </div>
    </div>
  );
}
