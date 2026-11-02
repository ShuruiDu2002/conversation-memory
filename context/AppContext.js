"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { demoConversations, demoNodes } from "@/lib/demoData";
import {
  applyOperations,
  countAllMemories,
  countCategories,
  deleteSubtree,
  formatOutline,
  moveNode,
  pruneEmptyAutoCategories,
  recentUpdates,
  setNodeState,
  updateNodeContent,
  updateNodeTitle
} from "@/lib/tree";
import { createConversation, createMemoryNode, createMessage, ME_ID } from "@/lib/models";

const AppContext = createContext(null);

function updateReason(reason) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text || text === "A later conversation may have changed this.") return "You said this changed.";
  return text;
}

function applyContentAndTitle(nodes, { id, content, title, fromTitle, reason }) {
  const existing = nodes.find((node) => node.id === id);
  if (!existing) return nodes;
  const toTitle = typeof title === "string" ? title.trim() : "";
  const previousTitle = String(fromTitle || existing.title || "").trim();
  const titleChanges = Boolean(toTitle) && toTitle !== existing.title;
  const nextContent = typeof content === "string" ? content : "";
  const contentChanges = Boolean(nextContent) && nextContent !== existing.content;
  const contentReason = titleChanges
    ? `${String(reason || "").replace(/[.\s]+$/, "")}; renamed from ${previousTitle} to ${toTitle}`
    : reason;
  let next = contentChanges ? updateNodeContent(nodes, id, nextContent, contentReason) : nodes;
  if (contentChanges && titleChanges) next = stampPreviousTitle(next, id, previousTitle);
  next = setNodeState(next, id, "confirmed");
  if (!titleChanges) return next;
  if (contentChanges) return updateNodeTitle(next, id, toTitle);
  return updateNodeTitle(next, id, toTitle, { title: previousTitle });
}

function stampPreviousTitle(nodes, id, previousTitle) {
  return nodes.map((node) => {
    if (node.id !== id || !node.history?.length) return node;
    const history = node.history.slice();
    history[history.length - 1] = { ...history[history.length - 1], title: previousTitle };
    return { ...node, history };
  });
}
const STORAGE_KEY = "conversation-memory:v1";

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return null;
    if (!Array.isArray(parsed.conversations) || parsed.conversations.length === 0) return null;
    if (!Array.isArray(parsed.nodes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
  const [chatMode, setChatMode] = useState("demo");
  const [extractMode, setExtractMode] = useState("demo");
  const [composer, setComposer] = useState("");
  const [creatingMemory, setCreatingMemory] = useState(false);
  const [memoryView, setMemoryView] = useState("graph");
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [freshIds, setFreshIds] = useState([]);
  const [timelineDay, setTimelineDay] = useState(null);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [memoryMode, setMemoryMode] = useState("agent");
  const [agentRunning, setAgentRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) || conversations[0];

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setConversations(stored.conversations);
      setNodes(stored.nodes);
      setActiveConversationId(stored.conversations[0].id);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: 1, conversations, nodes })
        );
      } catch {
        /* private mode or quota */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [hydrated, conversations, nodes]);

  useEffect(() => {
    if (!memoryDecision) return undefined;
    const timer = window.setTimeout(() => setMemoryDecision(null), 8000);
    return () => window.clearTimeout(timer);
  }, [memoryDecision]);

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
    setMemoryDecision(null);

    try {
      const history = [...(activeConversation?.messages || []), userMessage].map((message) => ({
        role: message.role,
        content: message.content
      }));

      if (memoryMode === "agent") setAgentRunning(true);
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          memoryMode,
          nodes: nodesRef.current.map((node) => ({
            id: node.id,
            title: node.title,
            type: node.type,
            parentId: node.parentId,
            content: node.content,
            state: node.state,
            origin: node.origin,
            sourceText: node.sourceText,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
            history: node.history
          }))
        })
      });
      const chatData = await chatRes.json();
      console.log("[client chat] status", chatRes.status, "mode", chatData.mode);
      console.log("[client chat] reply:\n", chatData.content);
      if (chatData.warning) console.warn("[client chat] warning:", chatData.warning);
      const assistantMessage = {
        ...createMessage("assistant", chatData.content || ""),
        usedMemoryIds: Array.isArray(chatData.usedMemories)
          ? chatData.usedMemories.map((memory) => memory.id).filter(Boolean)
          : [],
        trace: Array.isArray(chatData.trace) ? chatData.trace : undefined,
        memoryMode,
        warning: chatData.warning || undefined
      };
      if (chatData.mode) setChatMode(chatData.mode);
      setAgentRunning(false);

      setConversations((prev) =>
        prev.map((convo) =>
          convo.id === activeConversationId
            ? { ...convo, messages: [...convo.messages, assistantMessage] }
            : convo
        )
      );

      setIsExtracting(true);
      try {
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
      if (!extractRes.ok && !extracted.warning) {
        extracted.warning = "Memory extraction failed.";
      }
      console.log("[client extract] status", extractRes.status, "mode", extracted.mode);
      console.log("[client extract] decision", extracted.decision, extracted.reason);
      console.log("[client extract] operations:\n", extracted.operations);
      if (extracted.warning) console.warn("[client extract] warning:", extracted.warning);
      setExtractMode(extracted.mode === "live" ? "live" : "demo");
      if (extracted.warning) {
        setConversations((prev) =>
          prev.map((convo) => {
            if (convo.id !== activeConversationId) return convo;
            return {
              ...convo,
              messages: convo.messages.map((message) =>
                message.id === assistantMessage.id ? { ...message, extractWarning: extracted.warning } : message
              )
            };
          })
        );
      }
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
      const firstSuggestion = result.suggestions[0];
      if (result.newIds.length) {
        setFreshIds(result.newIds);
        const keepId =
          firstSuggestion?.type === "reorganize" ? firstSuggestion.moves?.[0]?.id : result.newIds[result.newIds.length - 1];
        if (keepId) setSelectedNodeId(keepId);
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
        setExtractMode("demo");
        setConversations((prev) =>
          prev.map((convo) => {
            if (convo.id !== activeConversationId) return convo;
            return {
              ...convo,
              messages: convo.messages.map((message) =>
                message.id === assistantMessage.id && !message.extractWarning
                  ? { ...message, extractWarning: "Memory extraction failed." }
                  : message
              )
            };
          })
        );
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
      setAgentRunning(false);
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
    setNodes((prev) => {
      const target = prev.find((node) => node.id === id);
      const next = deleteSubtree(prev, id);
      if (target?.type !== "memory") return next;
      return pruneEmptyAutoCategories(next, target.parentId);
    });
    if (selectedNodeId === id) setSelectedNodeId(ME_ID);
    if (pendingConflict?.existingId === id) setPendingConflict(null);
    if (pendingSuggestion?.nodeId === id || pendingSuggestion?.existingId === id) {
      setPendingSuggestion(null);
    }
  }

  function moveMemory(id, targetParentId, newCategoryName) {
    const name = typeof newCategoryName === "string" ? newCategoryName.trim() : "";
    setNodes((prev) => {
      const memory = prev.find((node) => node.id === id && node.type === "memory");
      if (!memory) return prev;
      if (!name) return moveNode(prev, id, targetParentId || null);
      const existing = prev.find(
        (node) =>
          node.type === "category" &&
          !node.parentId &&
          node.title.toLowerCase() === name.toLowerCase()
      );
      if (existing) return moveNode(prev, id, existing.id);
      const category = createMemoryNode({
        title: name,
        type: "category",
        parentId: null,
        content: "",
        state: "confirmed",
        origin: "manual"
      });
      return moveNode([...prev, category], id, category.id);
    });
    setSelectedNodeId(id);
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
    const snapshot = nodesRef.current;
    const memory = snapshot.find((node) => node.id === id);
    const parent = memory?.parentId ? snapshot.find((node) => node.id === memory.parentId) : null;
    const autoParent =
      memory?.type === "memory" &&
      parent?.type === "category" &&
      parent.origin === "inferred" &&
      parent.state === "suggested";
    const sameTurn =
      autoParent && Boolean(memory.sourceMessageId) && parent.sourceMessageId === memory.sourceMessageId;

    setNodes((prev) => {
      let next = setNodeState(prev, id, "confirmed");
      const currentParent = prev.find((node) => node.id === parent?.id);
      if (
        autoParent &&
        currentParent?.type === "category" &&
        currentParent.origin === "inferred" &&
        currentParent.state === "suggested"
      ) {
        next = setNodeState(next, currentParent.id, "confirmed");
      }
      return next;
    });
    setPendingSuggestion((current) => (current?.nodeId === id ? null : current));

    if (sameTurn) {
      const nextNodes = setNodeState(setNodeState(snapshot, id, "confirmed"), parent.id, "confirmed");
      void proposeReorganization(nextNodes, parent, memory.id);
    }
  }

  async function proposeReorganization(tree, category, confirmedMemoryId) {
    try {
      const response = await fetch("/api/memory/reorganize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: { id: category.id, title: category.title },
          confirmedMemoryId,
          outline: formatOutline(tree),
          nodes: tree.map((node) => ({
            id: node.id,
            title: node.title,
            type: node.type,
            parentId: node.parentId,
            content: node.content,
            state: node.state
          }))
        })
      });
      const data = await response.json();
      console.log("[client reorganize] status", response.status, "mode", data.mode, "moves", data.moves);
      const moves = Array.isArray(data.moves) ? data.moves : [];
      if (!moves.length) return;
      setPendingSuggestion({
        type: "reorganize",
        categoryId: category.id,
        categoryTitle: category.title,
        moves
      });
    } catch (error) {
      console.error(error);
    }
  }

  function acceptReorganization(suggestion) {
    const categoryId = suggestion?.categoryId;
    const moves = Array.isArray(suggestion?.moves) ? suggestion.moves : [];
    if (categoryId && moves.length) {
      setNodes((prev) => {
        let next = moves.reduce((acc, move) => moveNode(acc, move.id, categoryId), prev);
        const category = next.find((node) => node.id === categoryId);
        if (category?.type === "category" && category.origin === "inferred" && category.state === "suggested") {
          next = setNodeState(next, categoryId, "confirmed");
        }
        return next;
      });
    }
    setPendingSuggestion(null);
  }

  function dismissReorganization(suggestion) {
    const createdIds = Array.isArray(suggestion?.createdCategoryIds) ? suggestion.createdCategoryIds : [];
    if (createdIds.length) {
      setNodes((prev) => {
        let next = prev;
        for (const id of createdIds) {
          if (!next.some((node) => node.id === id)) continue;
          if (next.some((node) => node.parentId === id)) continue;
          next = pruneEmptyAutoCategories(next, id);
        }
        return next;
      });
    }
    setPendingSuggestion(null);
  }

  function rejectSuggestion(suggestion) {
    if (suggestion?.nodeId) deleteMemory(suggestion.nodeId);
    setPendingSuggestion(null);
  }

  function acceptUpdate(suggestion) {
    if (suggestion?.existingId && (suggestion.toContent || suggestion.toTitle)) {
      const reason = updateReason(suggestion.reason);
      setNodes((prev) =>
        applyContentAndTitle(prev, {
          id: suggestion.existingId,
          content: suggestion.toContent,
          title: suggestion.toTitle,
          fromTitle: suggestion.fromTitle,
          reason
        })
      );
      setSelectedNodeId(suggestion.existingId);
    }
    setPendingSuggestion(null);
  }

  function resolveConflict(choice) {
    if (!pendingConflict) return;
    if (choice === "new" && pendingConflict.existingId) {
      setNodes((prev) =>
        applyContentAndTitle(prev, {
          id: pendingConflict.existingId,
          content: pendingConflict.newContent,
          title: pendingConflict.newTitle,
          fromTitle: pendingConflict.existingTitle,
          reason: pendingConflict.reason || "You said this changed."
        })
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

  function resetDemo() {
    if (!window.confirm("Reset the demo? This clears saved conversations and memories in this browser.")) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConversations(demoConversations);
    setNodes(demoNodes);
    setActiveConversationId(demoConversations[0].id);
    setSelectedNodeId(ME_ID);
    setPendingConflict(null);
    setPendingSuggestion(null);
    setMemoryDecision(null);
    setComposer("");
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
      chatMode,
      extractMode,
      composer,
      setComposer,
      sendMessage,
      startNewChat,
      editMemory,
      renameMemory,
      deleteMemory,
      moveMemory,
      addManualMemory,
      addManualCategory,
      creatingMemory,
      setCreatingMemory,
      resolveConflict,
      confirmMemory,
      rejectSuggestion,
      acceptUpdate,
      acceptReorganization,
      dismissReorganization,
      setPendingSuggestion,
      memoryView,
      setMemoryView,
      highlightedMessageId,
      jumpToSource,
      freshIds,
      timelineDay,
      setTimelineDay,
      resetDemo,
      modelStats,
      confidenceOpen,
      setConfidenceOpen,
      memoryMode,
      setMemoryMode,
      agentRunning
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
      chatMode,
      extractMode,
      composer,
      creatingMemory,
      memoryView,
      highlightedMessageId,
      freshIds,
      timelineDay,
      modelStats.memories,
      confidenceOpen,
      memoryMode,
      agentRunning
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
