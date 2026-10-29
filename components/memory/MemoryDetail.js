"use client";

import { useEffect, useState } from "react";
import {
  conversationLabel,
  formatDisplayDate,
  formatDisplayTime,
  useAppState
} from "@/context/AppContext";
import { ME_ID } from "@/lib/models";
import { countMemories, getNode, getPathTitles } from "@/lib/tree";

const STATE_LABEL = {
  confirmed: "Confirmed",
  suggested: "Suggested",
  inferred: "Inferred",
  conflicting: "Conflicting",
  outdated: "Outdated"
};

export default function MemoryDetail() {
  const {
    nodes,
    selectedNodeId,
    conversations,
    editMemory,
    renameMemory,
    deleteMemory,
    jumpToSource,
    confirmMemory,
    confidenceOpen,
    setConfidenceOpen,
    setSelectedNodeId,
    setMemoryView,
    modelStats
  } = useAppState();
  const node = selectedNodeId === ME_ID ? null : getNode(nodes, selectedNodeId);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setConfidenceOpen(false);
    if (node) {
      setDraftTitle(node.title);
      setDraftContent(node.content || "");
    }
  }, [node?.id, setConfidenceOpen]);

  function closeDetail() {
    setSelectedNodeId(ME_ID);
    setMemoryView("graph");
  }

  if (selectedNodeId === ME_ID || !selectedNodeId || !node) {
    return (
      <div className="detail detail-idle">
        <p className="muted">
          {modelStats.memories} memories · {modelStats.categories} categories. Select a node to inspect
          it. Double-click a node to focus that branch.
        </p>
      </div>
    );
  }

  const path = getPathTitles(nodes, node.id).join(" → ");
  const originLabel =
    node.origin === "inferred" ? "AI-inferred" : node.origin === "manual" ? "Added by you" : "Directly stated";

  function save() {
    renameMemory(node.id, draftTitle.trim() || node.title);
    editMemory(node.id, draftContent);
    setEditing(false);
  }

  return (
    <div className="detail detail-open">
      <div className="detail-head">
        <div className="detail-kicker">{node.type === "category" ? "Topic" : "Memory"}</div>
        <button type="button" className="detail-close" aria-label="Close and return to graph" onClick={closeDetail}>
          ×
        </button>
      </div>
      {editing ? (
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
      ) : (
        <h3>{node.title}</h3>
      )}

      <div className="state-row">
        <span className={`state-pill ${node.state}`}>{STATE_LABEL[node.state] || node.state}</span>
        <button type="button" className="confidence-btn" onClick={() => setConfidenceOpen((v) => !v)}>
          Confidence: {node.confidence || "high"}
        </button>
      </div>
      {confidenceOpen && (
        <p className="confidence-explain">
          {node.confidenceReason ||
            (node.origin === "inferred"
              ? "This was inferred from conversation rather than stated as a hard fact."
              : "The user stated this directly.")}
        </p>
      )}

      <dl>
        <dt>What the AI knows</dt>
        <dd>
          {editing ? (
            <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} />
          ) : (
            node.content || "No description yet."
          )}
        </dd>
        <dt>Category</dt>
        <dd>{path}</dd>
        {node.type === "category" && (
          <>
            <dt>Under this topic</dt>
            <dd>{countMemories(nodes, node.id)} memories</dd>
          </>
        )}
        {node.sourceText && (
          <>
            <dt>Source</dt>
            <dd className="source-quote">You said: “{node.sourceText}”</dd>
            <dd className="muted" style={{ marginTop: 6 }}>
              {originLabel}
              {" · "}
              {formatDisplayDate(node.createdAt, true)}
              {node.createdAt ? ` · ${formatDisplayTime(node.createdAt)}` : ""}
            </dd>
            <dd className="muted">Conversation: {conversationLabel(conversations, node.sourceConversationId)}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{formatDisplayDate(node.createdAt, true)}</dd>
        <dt>Last updated</dt>
        <dd>{formatDisplayDate(node.updatedAt, true)}</dd>
      </dl>

      {node.history?.length > 0 && (
        <>
          <div className="detail-kicker" style={{ marginTop: 16 }}>
            History
          </div>
          <ul className="history">
            {node.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <time>{formatDisplayDate(entry.at, true)}</time>
                {entry.content}
                {entry.reason && <div className="muted">{entry.reason}</div>}
              </li>
            ))}
            <li>
              <time>{formatDisplayDate(node.updatedAt, true)}</time>
              {node.content}
            </li>
          </ul>
        </>
      )}

      <div className="detail-actions">
        {node.sourceMessageId && (
          <button className="ghost-btn" type="button" onClick={() => jumpToSource(node)}>
            View source conversation
          </button>
        )}
        {node.state === "suggested" && (
          <button className="primary-btn" type="button" onClick={() => confirmMemory(node.id)}>
            Confirm
          </button>
        )}
        {editing ? (
          <>
            <button className="primary-btn" type="button" onClick={save}>
              Save
            </button>
            <button className="ghost-btn" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="ghost-btn" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {confirmDelete ? (
          <button className="danger-btn" type="button" onClick={() => deleteMemory(node.id)}>
            Confirm delete
          </button>
        ) : (
          <button className="danger-btn" type="button" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
