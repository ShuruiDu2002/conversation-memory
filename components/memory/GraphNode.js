"use client";

import { Handle, Position } from "@xyflow/react";

const STATE_MARK = {
  confirmed: "●",
  suggested: "◐",
  inferred: "◐",
  conflicting: "⚠",
  outdated: "○"
};

export default function GraphNode({ data }) {
  const classes = [
    "gnode",
    data.isMe ? "me" : data.nodeType,
    data.selected ? "selected" : "",
    data.match ? "match" : "",
    data.dim ? "dim" : "",
    data.fresh ? "fresh" : "",
    data.state || ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} title={data.subtitle || data.title}>
      <Handle type="target" position={Position.Left} className="ghandle" />
      <div className="gnode-top">
        {!data.isMe && <span className={`state-dot ${data.state || "confirmed"}`}>{STATE_MARK[data.state] || "●"}</span>}
        <span className="gnode-title">{data.title}</span>
      </div>
      <div className="gnode-meta">
        {data.isMe ? "user model" : data.fresh ? "New memory" : data.meta}
      </div>
      <Handle type="source" position={Position.Right} className="ghandle" />
    </div>
  );
}
