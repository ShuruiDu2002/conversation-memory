"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useAppState } from "@/context/AppContext";
import { memoriesForConversation } from "@/lib/tree";

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
    setMemoryView
  } = useAppState();
  const endRef = useRef(null);
  const textRef = useRef(null);

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
        <span style={{ color: "var(--faint)", fontSize: 12 }}>{activeConversation?.title}</span>
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
          </article>
        ))}
        {isSending && (
          <div className="typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            Thinking
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
