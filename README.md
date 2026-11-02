# conversation-memory

HCI research prototype for an inspectable user model. After each chat turn, the app decides whether the latest user message is a lasting fact about them, then shows that fact in a hierarchical memory graph the user can confirm, edit, or reject.

The chat reply can read confirmed memories before it answers, either by injecting them or by letting a read-only agent look them up. This is a local, single-user prototype: the model lives in React state and is lost on refresh.

## What it does

- Chats through `POST /api/chat` using `gpt-4o-mini` (temperature 0.6).
- Extracts a memory decision through `POST /api/memory/extract` using `gpt-4o-mini` JSON mode (temperature 0.2).
- Labels a turn as `suggested`, `related`, `refinement`, `update`, `conflict`, `duplicate`, or `not_remembered`.
- Inserts new facts as `suggested` until the user chooses **Remember** or **Don't remember**.
- The extractor chooses a category for each new memory. You can move a memory to another category from its detail panel.
- On a conflict, marks the existing memory and asks the user to keep it, replace it, or edit by hand. A replacement appends revision history.
- Shows the same tree as a graph (React Flow), a nested list, and a created-date timeline.
- Substring search over title, content, and source text.
- Stores provenance (`sourceMessageId`, `sourceText`, `sourceConversationId`) and can jump back to the source message.
- Falls back to keyword rules in `lib/heuristicExtract.js` when `OPENAI_API_KEY` is missing or the OpenAI call fails. Those rules cover scripted demo phrases, not open-ended extraction.

The UI ships with a seeded graduate-student demo: 6 conversations, 8 categories, and 15 memories. One conversation (“What fish is this?”) is intentionally not turned into a memory.

## Memory-grounded replies

Chat runs in **Agent** mode by default. **Inject** and **Off** stay under the **⋯** menu, in Experiment → Memory mode. That choice is not saved.

In Inject mode, each reply is grounded in confirmed memories only. Suggested, inferred, conflicting, and outdated nodes are never retrieved.

`/api/chat` embeds the latest user message plus the previous user message with `text-embedding-3-small`, ranks confirmed memories by cosine similarity, and keeps the top matches above 0.25. A query that contains non-ASCII letters, such as Chinese, is rewritten into English with `gpt-4o-mini` before that embedding. ASCII queries are embedded as written. With no API key, or if that call fails, it falls back to keyword overlap.

Those facts are added to the system prompt as data. The response includes `usedMemories`, and the assistant message shows a **Used:** chip for each one. Clicking a chip selects that node in the graph.

## Agent mode

Agent mode replaces that automatic injection with a short tool loop. The model decides whether the question needs anything from the user model. A general question, such as arithmetic, is answered with no tool calls. The loop stops after 4 model calls; the last call cannot use tools and must answer.

The agent has three read-only tools. It cannot create, edit, move, or delete memories.

- `search_memory` finds confirmed memories with the same embeddings as Inject, but it skips the 0.25 cutoff and the English rewrite. The agent writes its own English query and judges the scores.
- `get_memory_outline` returns the category tree for confirmed memories, and lists inferred memories so a hedged belief can be found.
- `get_memory_details` returns content, state, origin, `sourceText`, `createdAt`, and history for a confirmed or inferred memory. An unknown id, or any other state, returns an error.

Tool results are data. The reply must not claim a fact the tools did not return. Each assistant message stores a trace. When the agent used a tool, the message shows **Agent steps (N)**. Expanded, each step shows Thought, Action, and Observation. When Agent mode answers without calling a tool, the message says it did not check memory. The Used chips still list memories the tools returned.

Without an API key, or if the loop fails, the route falls back to Inject and the message shows that warning. The top bar keeps chat and memory status separate: **Chat: live** or **demo**, and **Memory: live** or **fallback**.

## Retrieval evaluation

Inject keeps a cosine cutoff of 0.25. On a 15-memory corpus, rewriting Chinese queries into English before embedding changed the cutoff-0.25 results as follows. English queries are unchanged because ASCII text skips the rewrite.

| metric | Chinese, raw | Chinese, rewritten |
| --- | --- | --- |
| recall@4 | 0.80 | 1.00 |
| top-1 | 0.70 | 0.80 |
| MRR | 0.850 | 0.875 |
| negatives passing | 0/4 | 0/4 |

English stayed at recall@4 1.00 and top-1 1.00 because ASCII queries are not rewritten. Chinese negatives passing stayed 0/4.

The set is 20 author-written queries (10 English, 10 Chinese) plus 4 negative queries per language, scored against 15 memories. One negative, "hello", scores 0.323 raw and 0.237 after it is rewritten to "Hello.", so the margin above the memories at 0.25 is thin. Agent mode skips the threshold and lets the model judge scores. Re-run the probe with `npm run probe`.

## What it does not do

- It does not persist data. There is no database, auth, or multi-user support.
- It has no automated test suite. The retrieval numbers above come from the probe script.

## Stack

- Next.js 14 (App Router), React 18
- OpenAI Chat Completions API, model `gpt-4o-mini`, and Embeddings API, model `text-embedding-3-small`
- `@xyflow/react` for the graph, with a custom left-to-right layout
- `react-markdown` for chat bubbles

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
```

Create `.env.local` in the project root (this file is gitignored):

```bash
OPENAI_API_KEY=sk-...
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `OPENAI_API_KEY`, chat returns a canned demo reply and extraction uses the heuristic fallback. The header pill shows **OpenAI** or **Demo mode**.

```bash
npm run build
npm start
```

## How a turn works

1. The client appends the user message and calls `POST /api/chat` with the conversation, `memoryMode` (`off`, `inject`, or `agent`), and the memory tree. Inject retrieves confirmed memories and then generates the reply. Agent may call the read-only tools first.
2. The assistant message is appended.
3. The client calls `POST /api/memory/extract` with the new exchange, a text outline of the current tree, and a slim node list.
4. `applyOperations` in `lib/tree.js` writes suggestions or a pending conflict into React state.

Memory nodes are a flat list with `parentId`. Each node has `type` (`category` or `memory`), `state` (`confirmed`, `suggested`, `inferred`, `conflicting`, `outdated`), `confidence`, `origin` (`stated`, `inferred`, `manual`), provenance fields, and `history`.

## Project layout

```text
app/api/chat/route.js            chat completion and memory grounding
app/api/memory/extract/route.js  extraction prompt and normalization
app/page.js                      single page
components/                      chat, sessions, graph, list, timeline, detail
context/AppContext.js            client state and the send pipeline
lib/models.js                    node and message shapes
lib/retrieve.js                  confirmed-memory retrieval
lib/agentTools.js                read-only agent tools
lib/tree.js                      tree ops, search, timeline, applyOperations
lib/heuristicExtract.js          no-API fallback
lib/graphLayout.js               graph positions
lib/demoData.js                  seeded conversations and memories
```

## Notes

Do not commit `.env.local`. Set `DEBUG_PROMPTS=true` to log prompts, replies, and memory text on the server. Errors are always logged.
