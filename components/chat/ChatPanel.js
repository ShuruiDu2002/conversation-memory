"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAppState } from "@/context/AppContext";
import { memoriesForConversation } from "@/lib/tree";

const MEMORY_MODES = [
  { id: "agent", label: "Agent" },
  { id: "inject", label: "Inject" },
  { id: "off", label: "Off" }
];

function formatArgs(args) {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args)
    .map(([key, value]) => `${key}=${typeof value === "string" ? JSON.stringify(value) : value}`)
    .join(" ");
}

function AgentTrace({ trace }) {
  if (!Array.isArray(trace) || trace.length === 0) return null;
  return (
    <details className="agent-trace">
      <summary>Agent steps ({trace.length})</summary>
      <ol>
        {trace.map((step) => (
          <li key={step.step}>
            <div>
              <span>Thought</span> {step.thought}
            </div>
            <div>
              <span>Action</span> {step.tool}
              {formatArgs(step.args) ? ` ${formatArgs(step.args)}` : ""}
            </div>
            <div>
              <span>Observation</span> {step.resultSummary}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function UsedMemoryChips({ ids, nodes, onSelect }) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const chips = ids
    .map((id) => nodes.find((node) => node.id === id))
    .filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div className="used-memories">
      {chips.map((node) => (
        <button key={node.id} type="button" onClick={() => onSelect(node.id)}>
          Used: {node.title}
        </button>
      ))}
    </div>
  );
}

export default function ChatPanel() {
  const {
    activeConversation,
    composer,
    setComposer,
    sendMessage,
    isSending,
    highlightedMessageId,
    nodes,
    setSelectedNodeId,
    setMemoryView,
    memoryMode,
    setMemoryMode,
    agentRunning
  } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef(null);
  const textRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (highlightedMessageId) {
      const el = document.getElementById(`msg-${highlightedMessageId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, isSending, highlightedMessageId]);

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function onInput() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  const messages = activeConversation?.messages || [];
  const linked = memoriesForConversation(nodes, activeConversation?.id);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Chat</h2>
        <div className="header-actions chat-header-actions">
          <div className="chat-menu" ref={menuRef}>
            <button
              type="button"
              className="text-btn chat-menu-button"
              aria-label="Chat options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="chat-menu-panel">
                <div className="chat-menu-kicker">Experiment</div>
                <fieldset>
                  <legend>Memory mode</legend>
                  {MEMORY_MODES.map((mode) => (
                    <label key={mode.id}>
                      <input
                        type="radio"
                        name="memory-mode"
                        checked={memoryMode === mode.id}
                        onChange={() => setMemoryMode(mode.id)}
                      />
                      {mode.label}
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
          </div>
          <span className="chat-convo-title">{activeConversation?.title}</span>
        </div>
      </div>
      {linked.length > 0 && (
        <div className="convo-memories">
          <span>Memories created</span>
          {linked.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                setSelectedNodeId(node.id);
                setMemoryView("graph");
              }}
            >
              + {node.title}
            </button>
          ))}
        </div>
      )}
      <div className="panel-body chat-log">
        {messages.length === 0 && (
          <div className="empty">
            Talk as you would to a person. Only facts that describe <em>you</em> enter the user model
            on the right — not one-off questions.
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            id={`msg-${message.id}`}
            className={`msg ${message.role} ${highlightedMessageId === message.id ? "highlighted" : ""}`}
          >
            <div className="msg-label">{message.role === "user" ? "You" : "AI"}</div>
            <div className="msg-bubble">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
            {message.role === "assistant" && (
              <>
                <AgentTrace trace={message.trace} />
                {message.memoryMode === "agent" && !message.trace?.length && !message.warning && (
                  <p className="msg-note">Answered without checking memory</p>
                )}
                {message.warning && <p className="msg-note">{message.warning}</p>}
                {message.extractWarning && <p className="msg-note">{message.extractWarning}</p>}
                <UsedMemoryChips
                  ids={message.usedMemoryIds}
                  nodes={nodes}
                  onSelect={(id) => {
                    setSelectedNodeId(id);
                    setMemoryView("graph");
                  }}
                />
              </>
            )}
          </article>
        ))}
        {isSending && (
          <div className="typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            {agentRunning ? "Checking memory..." : "Thinking"}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <div className="composer-box">
          <textarea
            ref={textRef}
            value={composer}
            placeholder="Message…"
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={onKeyDown}
            onInput={onInput}
            rows={2}
          />
          <button className="primary-btn" type="submit" disabled={isSending || !composer.trim()}>
            Send
          </button>
        </div>
        <div className="hint">Enter to send · Shift+Enter for a new line</div>
      </form>
    </section>
  );
}
