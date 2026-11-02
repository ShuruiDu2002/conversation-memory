# Evaluation results

Date: 2026-11-02

Models:

- Extraction: gpt-4o-mini (temperature 0.2)
- Inject chat: gpt-4o-mini (temperature 0.6)
- Agent chat: gpt-4o-mini (temperature 0.2 with tools)
- Embeddings: text-embedding-3-small
- Baseline: lib/heuristicExtract.js keyword baseline

Counts: 31 extraction turns, 25 questions (20 need memory, 5 do not), 14 fixture memories.

Each question was sent once at the server's normal temperature. Results vary run to run.

## Extraction

| system | strict accuracy | lenient accuracy | outcome accuracy | category placement | errors |
| --- | --- | --- | --- | --- | --- |
| Heuristic baseline | 11/31 (0.35) | 11/31 (0.35) | 15/31 (0.48) | 0/1 (0.00) | 0 |
| Live extractor | 23/31 (0.74) | 23/31 (0.74) | 26/31 (0.84) | 1/1 (1.00) | 0 |

Strict accuracy counts only goldDecision. Lenient accuracy also accepts goldAlternatives. Outcome accuracy maps both labels into no_change (duplicate, not_remembered), new_memory (suggested, related), modify_existing (update, refinement), or conflict. Category placement is scored only on turns that set expectedPathIncludes or forbiddenPathIncludes, from the path of the suggested operation, and is separate from decision accuracy.

### Per decision

| decision | heuristic | live |
| --- | --- | --- |
| suggested | 1/3 (0.33) | 3/3 (1.00) |
| related | 0/5 (0.00) | 3/5 (0.60) |
| refinement | 1/4 (0.25) | 1/4 (0.25) |
| update | 0/3 (0.00) | 3/3 (1.00) |
| conflict | 1/4 (0.25) | 2/4 (0.50) |
| duplicate | 0/4 (0.00) | 3/4 (0.75) |
| not_remembered | 8/8 (1.00) | 8/8 (1.00) |

### Confusion matrix, heuristic

| gold \ predicted | suggested | related | refinement | update | conflict | duplicate | not_remembered | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| suggested | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| related | 1 | 0 | 0 | 0 | 0 | 0 | 4 | 0 |
| refinement | 1 | 0 | 1 | 0 | 0 | 0 | 2 | 0 |
| update | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| conflict | 1 | 0 | 0 | 0 | 1 | 0 | 2 | 0 |
| duplicate | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| not_remembered | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 |

### Confusion matrix, live

| gold \ predicted | suggested | related | refinement | update | conflict | duplicate | not_remembered | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| suggested | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| related | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| refinement | 0 | 0 | 1 | 1 | 0 | 2 | 0 | 0 |
| update | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| conflict | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 |
| duplicate | 0 | 0 | 0 | 0 | 1 | 3 | 0 | 0 |
| not_remembered | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 |

### Live mismatches

| id | gold | rawDecision | predicted | dropped |
| --- | --- | --- | --- | --- |
| e04 | related | suggested | suggested | — |
| e08 | related | suggested | suggested | — |
| e09 | refinement | duplicate | duplicate | — |
| e10 | refinement | update | update | — |
| e12 | refinement | duplicate | duplicate | — |
| e16 | conflict | update | update | — |
| e19 | conflict | update | update | — |
| e20 | duplicate | conflict | conflict | — |

## Memory-grounded QA

| mode | answer correctness | irrelevant memories (avg) | no-memory questions with empty usedMemories | latency ms | tool calls (avg) | errors |
| --- | --- | --- | --- | --- | --- | --- |
| off | 3/20 (0.15) | 0.0 | 5/5 (1.00) | 1247.9 | — | 0 |
| inject | 19/20 (0.95) | 1.8 | 5/5 (1.00) | 1299.8 | — | 0 |
| agent | 20/20 (1.00) | 1.7 | 5/5 (1.00) | 1779.1 | 0.92 | 0 |

Answer correctness is the share of needsMemory questions whose reply contains every mustMention group and none of mustNotMention. A reply that refuses also fails when rejectRefusal is set. Irrelevant memories are the average count of usedMemories outside relevantMemoryIds. The no-memory column is the share of needsMemory=false questions that returned no usedMemories.

No-memory baseline (Off-mode correctness on needsMemory questions): 3/20 (0.15)

## Limitations

Labels are author-written. The set is small. This file is a single run at the app's normal temperature, and the model is nondeterministic, so a later run will not match these numbers exactly.
