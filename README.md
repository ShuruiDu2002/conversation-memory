# conversation-memory

HCI research prototype for an inspectable user model. After each chat turn, the app decides whether the latest user message is a lasting fact about them, then shows that fact in a hierarchical memory graph the user can confirm, edit, or reject.

The chat reply is generated first and does not read stored memories. This is a local, single-user prototype: the model lives in React state and is lost on refresh.

## What it does

- Chats through `POST /api/chat` using `gpt-4o-mini` (temperature 0.6).
- Extracts a memory decision through `POST /api/memory/extract` using `gpt-4o-mini` JSON mode (temperature 0.2).
- Labels a turn as `suggested`, `related`, `refinement`, `update`, `conflict`, `duplicate`, or `not_remembered`.
- Inserts new facts as `suggested` until the user chooses **Remember** or **Don't remember**.
- On a conflict, marks the existing memory and asks the user to keep it, replace it, or edit by hand. A replacement appends revision history.
- Shows the same tree as a graph (React Flow), a nested list, and a created-date timeline.
- Substring search over title, content, and source text.
- Stores provenance (`sourceMessageId`, `sourceText`, `sourceConversationId`) and can jump back to the source message.
- Falls back to keyword rules in `lib/heuristicExtract.js` when `OPENAI_API_KEY` is missing or the OpenAI call fails. Those rules cover scripted demo phrases, not open-ended extraction.

The UI ships with a seeded graduate-student demo: 6 conversations, 8 categories, and 15 memories. One conversation (“What fish is this?”) is intentionally not turned into a memory.

## What it does not do

- It does not retrieve stored memories when generating the next reply. No embeddings, vector search, RAG, tool calling, or agent loop.
- It does not persist data. There is no database, auth, or multi-user support.
- It has no tests and no evaluation numbers.

## Stack

- Next.js 14 (App Router), React 18
- OpenAI Chat Completions API, model `gpt-4o-mini`
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

1. The client appends the user message and calls `POST /api/chat` with the conversation only.
2. The assistant message is appended.
3. The client calls `POST /api/memory/extract` with the new exchange, a text outline of the current tree, and a slim node list.
4. `applyOperations` in `lib/tree.js` writes suggestions or a pending conflict into React state.

Memory nodes are a flat list with `parentId`. Each node has `type` (`category` or `memory`), `state` (`confirmed`, `suggested`, `inferred`, `conflicting`, `outdated`), `confidence`, `origin` (`stated`, `inferred`, `manual`), provenance fields, and `history`.

## Project layout

```text
app/api/chat/route.js            chat completion
app/api/memory/extract/route.js  extraction prompt and normalization
app/page.js                      single page
components/                      chat, sessions, graph, list, timeline, detail
context/AppContext.js            client state and the send pipeline
lib/models.js                    node and message shapes
lib/tree.js                      tree ops, search, timeline, applyOperations
lib/heuristicExtract.js          no-API fallback
lib/graphLayout.js               graph positions
lib/demoData.js                  seeded conversations and memories
```

## Notes

Do not commit `.env.local`. The extractor logs prompts and model output to the server console.
