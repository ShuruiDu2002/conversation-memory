"use client";

import { useState } from "react";
import { useAppState } from "@/context/AppContext";

export default function CreateMemoryForm() {
  const { nodes, addManualMemory, addManualCategory, setCreatingMemory } = useAppState();
  const [kind, setKind] = useState("memory");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [parentId, setParentId] = useState("");
  const categories = nodes.filter((node) => node.type === "category");

  function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    if (kind === "category") {
      addManualCategory({ title: title.trim(), parentId: parentId || null });
    } else {
      addManualMemory({
        title: title.trim(),
        content: content.trim(),
        parentId: parentId || null
      });
    }
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <select value={kind} onChange={(event) => setKind(event.target.value)}>
        <option value="memory">Memory</option>
        <option value="category">Topic</option>
      </select>
      <input
        placeholder="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      {kind === "memory" && (
        <textarea
          placeholder="What should the AI remember?"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      )}
      <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
        <option value="">Top level</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.title}
          </option>
        ))}
      </select>
      <div className="create-actions">
        <button className="primary-btn" type="submit">
          Add to map
        </button>
        <button className="ghost-btn" type="button" onClick={() => setCreatingMemory(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
