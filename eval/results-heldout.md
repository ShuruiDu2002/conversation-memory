# Held-out extraction results

Date: 2026-11-02

Commit: 91e11e1

Extraction model: gpt-4o-mini (temperature 0.2)

Baseline: lib/heuristicExtract.js keyword baseline

Counts: 22 held-out turns, 22 fixture nodes (eval/fixture.json).

Each turn was sent once at the server's normal temperature. Results vary run to run. The held-out set is for reporting only. Prompts, labels and normalization are not tuned against it.

## Extraction

| system | strict accuracy | lenient accuracy | outcome accuracy | category placement | errors |
| --- | --- | --- | --- | --- | --- |
| Heuristic baseline | 5/22 (0.23) | 5/22 (0.23) | 6/22 (0.27) | n/a | 0 |
| Live extractor | 17/22 (0.77) | 17/22 (0.77) | 18/22 (0.82) | n/a | 0 |

Strict accuracy counts only goldDecision. Lenient accuracy also accepts goldAlternatives. Outcome accuracy maps both labels into no_change (duplicate, not_remembered), new_memory (suggested, related), modify_existing (update, refinement), or conflict. Category placement is scored only on turns that set expectedPathIncludes or forbiddenPathIncludes, from the path of the suggested operation, and is separate from decision accuracy.

### Per decision

| decision | heuristic | live |
| --- | --- | --- |
| suggested | 0/3 (0.00) | 3/3 (1.00) |
| related | 0/3 (0.00) | 3/3 (1.00) |
| refinement | 0/3 (0.00) | 0/3 (0.00) |
| update | 0/3 (0.00) | 3/3 (1.00) |
| conflict | 0/3 (0.00) | 1/3 (0.33) |
| duplicate | 0/2 (0.00) | 2/2 (1.00) |
| not_remembered | 5/5 (1.00) | 5/5 (1.00) |

### Confusion matrix, heuristic

| gold \ predicted | suggested | related | refinement | update | conflict | duplicate | not_remembered | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| suggested | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| related | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| refinement | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| update | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| conflict | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| duplicate | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| not_remembered | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |

### Confusion matrix, live

| gold \ predicted | suggested | related | refinement | update | conflict | duplicate | not_remembered | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| suggested | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| related | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| refinement | 0 | 1 | 0 | 1 | 0 | 0 | 1 | 0 |
| update | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| conflict | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| duplicate | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| not_remembered | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |

### Live mismatches

| id | text | gold | rawDecision | predicted | dropped |
| --- | --- | --- | --- | --- | --- |
| h07 | I'm interested in applied AI, particularly for education tools. | refinement | related | related | — |
| h08 | 我的本科专业是计算机科学，方向偏系统和网络。 | refinement | suggested | not_remembered | suggest_update mem-cs-undergrad: wrong type; operation: no operations left, so the decision became not_remembered |
| h09 | I'm lactose intolerant, and cheese is the thing that bothers me most. | refinement | update | update | — |
| h14 | 我其实对乳制品没有任何不适。 | conflict | update | update | — |
| h15 | My undergrad was at the University of Michigan. | conflict | update | update | — |

## Limitations

Labels are author-written. The set is small. This file is a single run at the app's normal temperature, and the model is nondeterministic, so a later run will not match these numbers exactly.
