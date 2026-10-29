"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { demoConversations, demoNodes } from "@/lib/demoData";
import {
  applyOperations,
  countAllMemories,
  countCategories,
  deleteSubtree,
  formatOutline,
  recentUpdates,
  setNodeState,
  updateNodeContent,
  updateNodeTitle
} from "@/lib/tree";
import { createConversation, createMemoryNode, createMessage, ME_ID } from "@/lib/models";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [conversations, setConversations] = useState(demoConversations);
  const [activeConversationId, setActiveConversationId] = useState(demoConversations[0].id);
  const [nodes, setNodes] = useState(demoNodes);
  const [selectedNodeId, setSelectedNodeId] = useState(ME_ID);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingConflict, setPendingConflict] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [memoryDecision, setMemoryDecision] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [apiMode, setApiMode] = useState("demo");
  const [composer, setComposer] = useState("");
  const [creatingMemory, setCreatingMemory] = useState(false);
  const [memoryView, setMemoryView] = useState("graph");
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [freshIds, setFreshIds] = useState([]);
  const [timelineDay, setTimelineDay] = useState(null);
  const [confidenceOpen, setConfidenceOpen] = useState(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) || conversations[0];

  async function sendMessage() {
    const text = composer.trim();
    if (!text || isSending) return;

    const userMessage = createMessage("user", text);
    setComposer("");
    setConversations((prev) =>
      prev.map((convo) => {
        if (convo.id !== activeConversationId) return convo;
        const title =
          convo.messages.length === 0 && convo.title === "New conversation"
            ? text.slice(0, 42)
            : convo.title;
        return { ...convo, title, messages: [...convo.messages, userMessage] };
      })
    );
    setIsSending(true);

    try {
      const history = [...(activeConversation?.messages || []), userMessage].map((message) => ({
        role: message.role,
        content: message.content
      }));

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });
      const chatData = await chatRes.json();
      console.log("[client chat] status", chatRes.status, "mode", chatData.mode);
      console.log("[client chat] reply:\n", chatData.content);
      if (chatData.warning) console.warn("[client chat] warning:", chatData.warning);
      const assistantMessage = createMessage("assistant", chatData.content || "");
      if (chatData.mode) setApiMode(chatData.mode);

      setConversations((prev) =>
        prev.map((convo) =>
          convo.id === activeConversationId
            ? { ...convo, messages: [...convo.messages, assistantMessage] }
            : convo
        )
      );

      setIsExtracting(true);
      const extractRes = await fetch("/api/memory/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          assistantMessage,
          outline: formatOutline(nodesRef.current),
          nodes: nodesRef.current.map((node) => ({
            id: node.id,
            title: node.title,
            type: node.type,
            parentId: node.parentId,
            content: node.content,
            state: node.state
          }))
        })
      });
      const extracted = await extractRes.json();
      console.log("[client extract] status", extractRes.status, "mode", extracted.mode);
      console.log("[client extract] decision", extracted.decision, extracted.reason);
      console.log("[client extract] operations:\n", extracted.operations);
      if (extracted.mode) setApiMode(extracted.mode);
      if (extracted.reason) {
        setMemoryDecision({
          decision: extracted.decision || "not_remembered",
          reason: extracted.reason
        });
      }

      const result = applyOperations(nodesRef.current, extracted.operations, {
        sourceMessageId: userMessage.id,
        sourceText: userMessage.content,
        sourceConversationId: activeConversationId
      });
      console.log("[client extract] applied", {
        newIds: result.newIds,
        conflicts: result.conflicts,
        suggestions: result.suggestions
      });
      setNodes(result.nodes);
      if (result.newIds.length) {
        setFreshIds(result.newIds);
        setSelectedNodeId(result.newIds[result.newIds.length - 1]);
        window.setTimeout(() => setFreshIds([]), 2800);
      }
      if (result.conflicts[0]) {
        setPendingConflict(result.conflicts[0]);
        setPendingSuggestion(null);
        if (result.conflicts[0].existingId) setSelectedNodeId(result.conflicts[0].existingId);
      } else if (result.suggestions[0]) {
        setPendingSuggestion(result.suggestions[0]);
      }
    } catch (error) {
      console.error(error);
      const fallback = createMessage(
        "assistant",
        "Something went wrong sending that message. Check the terminal and try again."
      );
      setConversations((prev) =>
        prev.map((convo) =>
          convo.id === activeConversationId
            ? { ...convo, messages: [...convo.messages, fallback] }
            : convo
        )
      );
    } finally {
      setIsSending(false);
      setIsExtracting(false);
    }
  }

  function startNewChat() {
    const convo = createConversation();
    setConversations((prev) => [convo, ...prev]);
    setActiveConversationId(convo.id);
    setMemoryDecision(null);
  }

  function editMemory(id, content) {
    setNodes((prev) => updateNodeContent(prev, id, content));
  }

  function renameMemory(id, title) {
    setNodes((prev) => updateNodeTitle(prev, id, title));
  }

  function deleteMemory(id) {
    setNodes((prev) => deleteSubtree(prev, id));
    if (selectedNodeId === id) setSelectedNodeId(ME_ID);
    if (pendingConflict?.existingId === id) setPendingConflict(null);
    if (pendingSuggestion?.nodeId === id || pendingSuggestion?.existingId === id) {
      setPendingSuggestion(null);
    }
  }

  function addManualMemory({ title, content, parentId }) {
    const node = createMemoryNode({
      title: title || "Untitled memory",
      type: "memory",
      parentId: parentId || null,
      content,
      state: "confirmed",
      origin: "manual",
      sourceText: "Added manually",
      sourceConversationId: activeConversationId
    });
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
    setFreshIds([node.id]);
    setCreatingMemory(false);
  }

  function addManualCategory({ title, parentId }) {
    const node = createMemoryNode({
      title: title || "Untitled topic",
      type: "category",
      parentId: parentId || null,
      content: "",
      state: "confirmed",
      origin: "manual"
    });
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
    setCreatingMemory(false);
  }

  function confirmMemory(id) {
    setNodes((prev) => setNodeState(prev, id, "confirmed"));
    setPendingSuggestion((current) => (current?.nodeId === id ? null : current));
  }

  function rejectSuggestion(suggestion) {
    if (suggestion?.nodeId) deleteMemory(suggestion.nodeId);
    setPendingSuggestion(null);
  }

  function acceptUpdate(suggestion) {
    if (suggestion?.existingId && suggestion.toContent) {
      setNodes((prev) =>
        setNodeState(
          updateNodeContent(prev, suggestion.existingId, suggestion.toContent, suggestion.reason),
          suggestion.existingId,
          "confirmed"
        )
      );
      setSelectedNodeId(suggestion.existingId);
    }
    setPendingSuggestion(null);
  }

  function resolveConflict(choice) {
    if (!pendingConflict) return;
    if (choice === "new" && pendingConflict.existingId) {
      setNodes((prev) =>
        setNodeState(
          updateNodeContent(
            prev,
            pendingConflict.existingId,
            pendingConflict.newContent,
            "User chose the newer statement."
          ),
          pendingConflict.existingId,
          "confirmed"
        )
      );
    }
    if (choice === "existing" && pendingConflict.existingId) {
      setNodes((prev) => setNodeState(prev, pendingConflict.existingId, "confirmed"));
    }
    if (choice === "review" && pendingConflict.existingId) {
      setSelectedNodeId(pendingConflict.existingId);
      return;
    }
    if (choice === "neither" && pendingConflict.existingId) {
      setSelectedNodeId(pendingConflict.existingId);
      setCreatingMemory(true);
    }
    setPendingConflict(null);
  }

  function jumpToSource(node) {
    if (node?.sourceConversationId) setActiveConversationId(node.sourceConversationId);
    if (node?.sourceMessageId) {
      setHighlightedMessageId(node.sourceMessageId);
      window.setTimeout(() => setHighlightedMessageId(null), 4000);
    }
  }

  function exploreModel() {
    setGraphExpanded(true);
    setMemoryView("graph");
    setSelectedNodeId(ME_ID);
  }

  const modelStats = {
    memories: countAllMemories(nodes),
    categories: countCategories(nodes),
    recent: recentUpdates(nodes, 5).length
  };

  const value = useMemo(
    () => ({
      conversations,
      activeConversationId,
      setActiveConversationId,
      activeConversation,
      nodes,
      selectedNodeId,
      setSelectedNodeId,
      searchQuery,
      setSearchQuery,
      pendingConflict,
      pendingSuggestion,
      memoryDecision,
      isSending,
      isExtracting,
      apiMode,
      composer,
      setComposer,
      sendMessage,
      startNewChat,
      editMemory,
      renameMemory,
      deleteMemory,
      addManualMemory,
      addManualCategory,
      creatingMemory,
      setCreatingMemory,
      resolveConflict,
      confirmMemory,
      rejectSuggestion,
      acceptUpdate,
      setPendingSuggestion,
      memoryView,
      setMemoryView,
      graphExpanded,
      setGraphExpanded,
      highlightedMessageId,
      jumpToSource,
      freshIds,
      timelineDay,
      setTimelineDay,
      exploreModel,
      modelStats,
      confidenceOpen,
      setConfidenceOpen
    }),
    [
      conversations,
      activeConversationId,
      activeConversation,
      nodes,
      selectedNodeId,
      searchQuery,
      pendingConflict,
      pendingSuggestion,
      memoryDecision,
      isSending,
      isExtracting,
      apiMode,
      composer,
      creatingMemory,
      memoryView,
      graphExpanded,
      highlightedMessageId,
      freshIds,
      timelineDay,
      modelStats.memories,
      confidenceOpen
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used inside AppProvider");
  return ctx;
}

export function formatDisplayDate(iso, withYear = false) {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {})
  });
}

export function formatDisplayTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function conversationLabel(conversations, id) {
  const convo = conversations.find((item) => item.id === id);
  return convo?.title || "Unknown conversation";
}
