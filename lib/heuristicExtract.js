/**
 * Demo-mode extraction: prefer skipping ephemeral chat.
 * Only long-term self-description becomes a suggested memory.
 */

function pack(decision, reason, operations = []) {
  return { decision, reason, operations };
}

export function heuristicExtract(userText, nodes) {
  const text = userText.trim();
  const lower = text.toLowerCase();

  const isQuestion = /^(what|who|where|when|why|how|is this|can you|is)\b/.test(lower) || /\?$/.test(text);
  const looksPersistent = /\b(i am|i'm|i will|i want|i'm going|my |i study|i work|i live|i really|i enjoy|i play|i listen|i like|i love|i prefer|i hate)\b/i.test(
    text
  );

  if (/^\s*(rewrite|translate|proofread|edit)\b/i.test(text)) {
    return pack(
      "not_remembered",
      "This is text you asked to rewrite or translate, not a statement about you."
    );
  }

  if (/\bmy friend\b/.test(lower)) {
    return pack("not_remembered", "This is about someone else, not a lasting fact about you.");
  }

  if (/\b(hungry|tired|sleepy)\b/.test(lower) && /\b(right now|today|currently)\b/.test(lower)) {
    return pack("not_remembered", "This describes the current moment, not a lasting fact about you.");
  }

  if (isQuestion && !looksPersistent) {
    return pack("not_remembered", "This is a one-time question and does not describe you.");
  }

  const csMemory = nodes.find(
    (node) => node.type === "memory" && /computer science/i.test(`${node.title} ${node.content}`)
  );
  if (csMemory && /\bjournalism\b/.test(lower) && /\bmajor\b/.test(lower)) {
    return pack("conflict", "This disagrees with an existing memory about your major.", [
      {
        type: "conflict",
        existingMemoryId: csMemory.id,
        existingContent: csMemory.content,
        newContent: "User's major is Journalism.",
        reason: "This disagrees with an existing memory about your major."
      }
    ]);
  }

  const hci = nodes.find((node) => node.id === "mem-hci" || /^hci$/i.test(node.title));
  if (hci && /applied ai/.test(lower) && /hci/.test(lower) && /interested/.test(lower)) {
    return pack(
      "update",
      "This adds to an existing interest rather than replacing it.",
      [
        {
          type: "suggest_update",
          id: hci.id,
          title: "HCI",
          existingContent: hci.content,
          newContent: "User is interested in HCI and applied AI together.",
          reason: "This adds to an existing interest rather than replacing it."
        }
      ]
    );
  }

  if (/\bfor this question\b/.test(lower)) {
    return pack("not_remembered", "This applies only to the current question, not to a lasting preference.");
  }

  const integrated = integrateWithExisting(lower, nodes);
  if (integrated) return integrated;

  if (/\b(i like|i love|i prefer|i hate|i don't like|i do not like)\b/.test(lower)) {
    return pack(
      "suggested",
      "You stated a personal preference that may remain relevant in later conversations.",
      [
        {
          type: "suggest_memory",
          path: ["Interests"],
          title: "Preference",
          content: text.length > 180 ? `${text.slice(0, 177)}…` : `User said: ${text}`,
          origin: "stated",
          confidence: "medium",
          reason: "You stated a personal preference that may remain relevant in later conversations."
        }
      ]
    );
  }

  if (!looksPersistent || text.length < 18) {
    return pack("not_remembered", "This does not add a lasting fact about you.");
  }

  const rules = [
    { test: /seafood|cook fish|cooking/, path: ["Interests", "Food"], title: "Seafood", origin: "stated" },
    { test: /northwestern|mscs|minnesota|computer science|coursework|graduate/, path: ["Education"], title: "Education note" },
    { test: /\b(hci|applied ai|swe|software engineer|internship|phd|industry)\b/, path: ["Career"], title: "Career note" },
    { test: /\b(project|prototype|rpg|working on|memorylens)\b/, path: ["Projects"], title: "Project note" },
    { test: /\b(apartment|moving|roommate|live in|living in)\b/, path: ["Living"], title: "Living note" },
    { test: /\b(become|engineer)\b/, path: ["Career"], title: "Career note" },
    { test: /\b(jazz|music|game|hobby|enjoy|interested in)\b/, path: ["Interests"], title: "Interest" }
  ];

  for (const rule of rules) {
    if (rule.test.test(lower)) {
      const reason = "You stated something about yourself that may remain relevant in later conversations.";
      return pack("suggested", reason, [
        {
          type: "suggest_memory",
          path: rule.path,
          title: rule.title,
          content: text.length > 180 ? `${text.slice(0, 177)}…` : `User said: ${text}`,
          origin: rule.origin || "stated",
          confidence: "medium",
          reason
        }
      ]);
    }
  }

  return pack("not_remembered", "This does not add a lasting fact about you.");
}

function integrateWithExisting(lower, nodes) {
  const temporal = /\b(anymore|no longer|used to|moved|previously)\b/.test(lower) || /\bbut now\b/.test(lower);
  const chocolate = findMemory(nodes, /chocolate/i);
  const jazz = findMemory(nodes, /\bjazz\b/i);
  const hci = findMemory(nodes, /\bhci\b/i);

  if (chocolate && /\bchocolate\b/.test(lower)) {
    if (temporal) {
      return pack("update", "You said this has changed, so an existing memory may need to be updated.", [
        asUpdate(chocolate, "User no longer likes chocolate.", "You said this has changed, so an existing memory may need to be updated.")
      ]);
    }
    if (/\b(hate|dislike)\b/.test(lower)) {
      return pack("conflict", "This disagrees with an existing memory, so it needs your review.", [
        {
          type: "conflict",
          existingMemoryId: chocolate.id,
          existingContent: chocolate.content,
          newContent: "User hates chocolate.",
          reason: "This disagrees with an existing memory, so it needs your review."
        }
      ]);
    }
    if (/\bdark chocolate\b/.test(lower) && !/\b(cake|cheesecake)\b/.test(lower)) {
      if (/dark chocolate/i.test(`${chocolate.title} ${chocolate.content}`)) {
        return pack("duplicate", "This matches something already in your model, so nothing new was added.");
      }
      return pack("refinement", "This adds more detail to something already in your model.", [
        asUpdate(chocolate, "User likes chocolate, especially dark chocolate.", "This adds more detail to something already in your model.")
      ]);
    }
    if (/\b(cake|cheesecake)\b/.test(lower)) {
      return pack("related", "This is related to an existing interest, but it describes a separate preference.", [
        asMemory("Chocolate cake", "User prefers chocolate cake over cheesecake.", "This is related to an existing interest, but it describes a separate preference.")
      ]);
    }
    if (/\blike chocolate\b/.test(lower)) {
      return pack("duplicate", "This matches something already in your model, so nothing new was added.");
    }
  }

  if (hci && /\bhuman[- ]ai\b/.test(lower)) {
    return pack("refinement", "This adds more detail to something already in your model.", [
      asUpdate(hci, "User is interested in HCI, especially human-AI interaction.", "This adds more detail to something already in your model.")
    ]);
  }

  if (jazz && /\bclassical\b/.test(lower)) {
    return pack("related", "This is related to an existing interest, but it describes a separate preference.", [
      asMemory("Classical music", "User also likes classical music.", "This is related to an existing interest, but it describes a separate preference.")
    ]);
  }

  return null;
}

function findMemory(nodes, pattern) {
  return nodes.find((node) => node.type === "memory" && pattern.test(`${node.title} ${node.content}`));
}

function asUpdate(existing, content, reason) {
  return {
    type: "suggest_update",
    id: existing.id,
    existingMemoryId: existing.id,
    title: existing.title,
    existingContent: existing.content,
    newContent: content,
    content,
    reason
  };
}

function asMemory(title, content, reason) {
  return {
    type: "suggest_memory",
    path: ["Interests"],
    title,
    content,
    origin: "stated",
    confidence: "medium",
    reason
  };
}
