/**
 * Seeded graduate-student demo: conversations + a populated user model.
 * Some chats are long-term (school, career); one is ephemeral (a fish photo)
 * and deliberately creates no memories.
 */

const AUG20 = "2026-08-20T15:02:00.000Z";
const AUG20B = "2026-08-20T15:04:00.000Z";
const AUG22 = "2026-08-22T16:10:00.000Z";
const AUG28 = "2026-08-28T17:12:00.000Z";
const SEP1 = "2026-09-01T12:04:00.000Z";
const SEP2 = "2026-09-02T18:30:00.000Z";
const SEP3 = "2026-09-03T19:20:00.000Z";

export const DEMO_CONVERSATION_ID = "convo-northwestern";

function node(partial) {
  return {
    state: "confirmed",
    confidence: "high",
    confidenceReason: "The user stated this directly.",
    origin: "stated",
    history: [],
    sourceMessageId: null,
    sourceText: null,
    sourceConversationId: null,
    ...partial
  };
}

export const demoConversations = [
  {
    id: DEMO_CONVERSATION_ID,
    title: "MSCS at Northwestern",
    createdAt: "2026-08-20T15:00:00.000Z",
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "I'm starting an MSCS at Northwestern this fall.",
        timestamp: AUG20
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "That's a strong next step. Northwestern's MSCS leaves room for both systems work and HCI. What do you want the first quarter to look like?",
        timestamp: "2026-08-20T15:02:08.000Z"
      },
      {
        id: "msg-3",
        role: "user",
        content:
          "HCI and applied AI. I'm also looking at an apartment near campus, and I want to keep building the conversation-memory research prototype.",
        timestamp: AUG20B
      },
      {
        id: "msg-4",
        role: "assistant",
        content:
          "I'll treat HCI, applied AI, housing near campus, and conversation-memory as the through-lines. We can plan coursework or the prototype whenever you want to go deeper.",
        timestamp: "2026-08-20T15:04:12.000Z"
      }
    ]
  },
  {
    id: "convo-umn",
    title: "Undergrad at Minnesota",
    createdAt: "2026-08-22T16:00:00.000Z",
    messages: [
      {
        id: "msg-9",
        role: "user",
        content: "Before this I did my undergrad in Computer Science at the University of Minnesota.",
        timestamp: AUG22
      },
      {
        id: "msg-10",
        role: "assistant",
        content:
          "So the MSCS is a continuation, not a pivot. That CS foundation is useful context for both the HCI work and the systems-heavy courses.",
        timestamp: "2026-08-22T16:10:08.000Z"
      }
    ]
  },
  {
    id: "convo-career",
    title: "Career direction",
    createdAt: "2026-08-28T17:10:00.000Z",
    messages: [
      {
        id: "msg-5",
        role: "user",
        content:
          "I'm trying to decide between SWE roles and HCI research. I like building products, but I also want to study how people manage AI memory. I interned at a local software company in 2023, but that doesn't feel central anymore.",
        timestamp: AUG28
      },
      {
        id: "msg-6",
        role: "assistant",
        content:
          "Industry vs. research doesn't have to be a hard split — especially if the prototype is the experiment. I can keep the old internship as background, not as a current goal.",
        timestamp: "2026-08-28T17:12:14.000Z"
      }
    ]
  },
  {
    id: "convo-projects",
    title: "Side projects",
    createdAt: "2026-09-01T12:00:00.000Z",
    messages: [
      {
        id: "msg-7",
        role: "user",
        content: "Besides conversation-memory, I still tinker with an AI RPG on weekends.",
        timestamp: SEP1
      },
      {
        id: "msg-8",
        role: "assistant",
        content:
          "One project is an HCI instrument; the other is playful world-building. Both teach you something about long-running AI context.",
        timestamp: "2026-09-01T12:04:10.000Z"
      }
    ]
  },
  {
    id: "convo-interests",
    title: "Weekends",
    createdAt: "2026-09-02T18:00:00.000Z",
    messages: [
      {
        id: "msg-11",
        role: "user",
        content:
          "When I'm not working I play narrative video games, and I think I listen to a lot of jazz while coding.",
        timestamp: SEP2
      },
      {
        id: "msg-12",
        role: "assistant",
        content: "Games for stories, jazz for focus — I'll keep those as interests unless you tell me otherwise.",
        timestamp: "2026-09-02T18:30:10.000Z"
      }
    ]
  },
  {
    id: "convo-fish",
    title: "What fish is this?",
    createdAt: "2026-09-03T19:10:00.000Z",
    messages: [
      {
        id: "msg-13",
        role: "user",
        content: "What kind of fish is this? I saw it on a menu.",
        timestamp: SEP3
      },
      {
        id: "msg-14",
        role: "assistant",
        content:
          "From the description it sounds like sea bass — but that's a one-off question, not something I'd file as a fact about you.",
        timestamp: "2026-09-03T19:20:08.000Z"
      }
    ]
  }
];

export const demoNodes = [
  node({
    id: "cat-education",
    title: "Education",
    type: "category",
    parentId: null,
    content: "School, degrees, and academic plans.",
    sourceMessageId: "msg-1",
    sourceText: "I'm starting an MSCS at Northwestern this fall.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20,
    updatedAt: AUG22
  }),
  node({
    id: "cat-northwestern",
    title: "Northwestern",
    type: "category",
    parentId: "cat-education",
    content: "Graduate study starting fall 2026.",
    sourceMessageId: "msg-1",
    sourceText: "I'm starting an MSCS at Northwestern this fall.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20,
    updatedAt: AUG20
  }),
  node({
    id: "mem-mscs",
    title: "MSCS",
    type: "memory",
    parentId: "cat-northwestern",
    content: "User is pursuing an MSCS at Northwestern starting fall 2026.",
    sourceMessageId: "msg-1",
    sourceText: "I'm starting an MSCS at Northwestern this fall.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20,
    updatedAt: AUG20
  }),
  node({
    id: "mem-courses",
    title: "Courses",
    type: "memory",
    parentId: "cat-northwestern",
    content: "User wants first-quarter courses in HCI and applied AI.",
    sourceMessageId: "msg-3",
    sourceText: "HCI and applied AI.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG20B
  }),
  node({
    id: "mem-research",
    title: "Research",
    type: "memory",
    parentId: "cat-northwestern",
    content: "User wants to study how people understand and manage AI conversational memory.",
    sourceMessageId: "msg-5",
    sourceText: "I also want to study how people manage AI memory.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28
  }),
  node({
    id: "mem-hci-nw",
    title: "HCI Research",
    type: "memory",
    parentId: "cat-northwestern",
    content: "User is interested in doing HCI research at Northwestern, not only taking HCI classes.",
    origin: "inferred",
    state: "inferred",
    confidence: "medium",
    confidenceReason: "Inferred by combining the MSCS plan with later HCI research comments.",
    sourceMessageId: "msg-5",
    sourceText: "I also want to study how people manage AI memory.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28
  }),
  node({
    id: "cat-umn",
    title: "University of Minnesota",
    type: "category",
    parentId: "cat-education",
    content: "Undergraduate study.",
    sourceMessageId: "msg-9",
    sourceText: "I did my undergrad in Computer Science at the University of Minnesota.",
    sourceConversationId: "convo-umn",
    createdAt: AUG22,
    updatedAt: AUG22
  }),
  node({
    id: "mem-cs-undergrad",
    title: "Computer Science",
    type: "memory",
    parentId: "cat-umn",
    content: "User completed an undergraduate degree in Computer Science at the University of Minnesota.",
    sourceMessageId: "msg-9",
    sourceText: "I did my undergrad in Computer Science at the University of Minnesota.",
    sourceConversationId: "convo-umn",
    createdAt: AUG22,
    updatedAt: AUG22
  }),
  node({
    id: "mem-major",
    title: "Major",
    type: "memory",
    parentId: "cat-education",
    content: "User's academic field is Computer Science.",
    sourceMessageId: "msg-9",
    sourceText: "I did my undergrad in Computer Science at the University of Minnesota.",
    sourceConversationId: "convo-umn",
    createdAt: AUG20,
    updatedAt: AUG22,
    history: [
      {
        at: AUG20,
        content: "User studies Computer Science.",
        reason: "Created from the MSCS announcement."
      }
    ]
  }),
  node({
    id: "cat-career",
    title: "Career",
    type: "category",
    parentId: null,
    content: "Professional direction still in motion.",
    sourceMessageId: "msg-5",
    sourceText: "I'm trying to decide between SWE roles and HCI research.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28
  }),
  node({
    id: "mem-hci",
    title: "HCI",
    type: "memory",
    parentId: "cat-career",
    content: "User is interested in HCI, especially how people organize knowledge from LLM conversations.",
    sourceMessageId: "msg-3",
    sourceText: "I'm interested in HCI and applied AI.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG28
  }),
  node({
    id: "mem-applied-ai",
    title: "Applied AI",
    type: "memory",
    parentId: "cat-career",
    content: "User wants to work with applied AI, not only theoretical ML.",
    sourceMessageId: "msg-3",
    sourceText: "I'm interested in HCI and applied AI.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG20B
  }),
  node({
    id: "cat-industry",
    title: "Industry",
    type: "category",
    parentId: "cat-career",
    content: "Product and software-engineering paths.",
    sourceMessageId: "msg-5",
    sourceText: "I'm trying to decide between SWE roles and HCI research.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28
  }),
  node({
    id: "mem-swe",
    title: "Software Engineering",
    type: "memory",
    parentId: "cat-industry",
    content: "User is considering software engineering roles alongside research.",
    sourceMessageId: "msg-5",
    sourceText: "I'm trying to decide between SWE roles and HCI research.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28
  }),
  node({
    id: "mem-intern",
    title: "2023 internship",
    type: "memory",
    parentId: "cat-industry",
    content: "User interned at a local software company in 2023. They no longer treat it as a central part of their story.",
    state: "outdated",
    confidence: "medium",
    confidenceReason: "Stated, then described as no longer central.",
    sourceMessageId: "msg-5",
    sourceText: "I interned at a local software company in 2023, but that doesn't feel central anymore.",
    sourceConversationId: "convo-career",
    createdAt: AUG28,
    updatedAt: AUG28,
    history: [
      {
        at: AUG28,
        content: "User interned at a local software company in 2023.",
        reason: "Later marked outdated from the same conversation."
      }
    ]
  }),
  node({
    id: "cat-projects",
    title: "Projects",
    type: "category",
    parentId: null,
    content: "Active research and side projects.",
    sourceMessageId: "msg-3",
    sourceText: "I want to keep building the conversation-memory research prototype.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: SEP1
  }),
  node({
    id: "mem-conv-memory",
    title: "Conversation Memory",
    type: "memory",
    parentId: "cat-projects",
    content: "User is building an HCI research prototype for organizing information from LLM conversations.",
    sourceMessageId: "msg-3",
    sourceText: "I want to keep building the conversation-memory research prototype.",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG20B
  }),
  node({
    id: "mem-ai-rpg",
    title: "AI RPG",
    type: "memory",
    parentId: "cat-projects",
    content: "User tinkers with an AI RPG as a weekend side project.",
    sourceMessageId: "msg-7",
    sourceText: "Besides conversation-memory, I still tinker with an AI RPG on weekends.",
    sourceConversationId: "convo-projects",
    createdAt: SEP1,
    updatedAt: SEP1
  }),
  node({
    id: "cat-interests",
    title: "Interests",
    type: "category",
    parentId: null,
    content: "What the user returns to outside of school.",
    sourceMessageId: "msg-11",
    sourceText: "When I'm not working I play narrative video games…",
    sourceConversationId: "convo-interests",
    createdAt: SEP2,
    updatedAt: SEP2
  }),
  node({
    id: "mem-games",
    title: "Video games",
    type: "memory",
    parentId: "cat-interests",
    content: "User plays narrative video games to unwind.",
    sourceMessageId: "msg-11",
    sourceText: "When I'm not working I play narrative video games, and I think I listen to a lot of jazz while coding.",
    sourceConversationId: "convo-interests",
    createdAt: SEP2,
    updatedAt: SEP2
  }),
  node({
    id: "mem-jazz",
    title: "Jazz",
    type: "memory",
    parentId: "cat-interests",
    content: "User likely listens to jazz while coding.",
    origin: "inferred",
    state: "inferred",
    confidence: "low",
    confidenceReason: "Hedged in conversation (“I think I listen…”), not a firm preference.",
    sourceMessageId: "msg-11",
    sourceText: "I think I listen to a lot of jazz while coding.",
    sourceConversationId: "convo-interests",
    createdAt: SEP2,
    updatedAt: SEP2
  }),
  node({
    id: "cat-living",
    title: "Living",
    type: "category",
    parentId: null,
    content: "Housing and moving for school.",
    sourceMessageId: "msg-3",
    sourceText: "I'm also looking at an apartment near campus",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG20B
  }),
  node({
    id: "mem-apartment",
    title: "Apartment",
    type: "memory",
    parentId: "cat-living",
    content: "User is looking for an apartment near Northwestern's campus.",
    state: "suggested",
    confidence: "medium",
    confidenceReason: "Mentioned once as a current search, not a settled fact.",
    sourceMessageId: "msg-3",
    sourceText: "I'm also looking at an apartment near campus",
    sourceConversationId: DEMO_CONVERSATION_ID,
    createdAt: AUG20B,
    updatedAt: AUG20B
  })
];
