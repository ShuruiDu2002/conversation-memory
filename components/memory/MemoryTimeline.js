"use client";

import { formatDisplayDate, useAppState } from "@/context/AppContext";
import { groupTimeline } from "@/lib/tree";

export default function MemoryTimeline() {
  const { nodes, setSelectedNodeId, timelineDay, setTimelineDay, setMemoryView } = useAppState();
  const groups = groupTimeline(nodes);

  return (
    <div className="timeline">
      <p className="timeline-lead">How the user model grew. Click a date to highlight those nodes in the graph.</p>
      {groups.map((group) => (
        <section key={group.day} className={timelineDay === group.day ? "on" : ""}>
          <button
            type="button"
            className="timeline-day"
            onClick={() => {
              const next = timelineDay === group.day ? null : group.day;
              setTimelineDay(next);
              if (next) setMemoryView("graph");
            }}
          >
            {formatDisplayDate(group.day, true)}
          </button>
          <ul>
            {group.items.map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => setSelectedNodeId(node.id)}>
                  {node.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
