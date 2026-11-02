/**
 * Evaluation harness. Requires the local dev server:
 *   npm run dev
 *   npm run eval            extraction + memory-grounded QA
 *   npm run eval:heldout    extraction only, against eval/heldout.json
 *
 * Uses eval/fixture.json, never the browser's saved memories.
 * Each question is sent once at the server's normal temperature, so scores vary run to run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heuristicExtract } from "../lib/heuristicExtract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELDOUT = process.argv.includes("--heldout");
const HELDOUT_FILE = process.env.EVAL_HELDOUT_FILE || join(root, "eval/heldout.json");
const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 120000;
const DECISIONS = [
  "suggested",
  "related",
  "refinement",
  "update",
  "conflict",
  "duplicate",
  "not_remembered"
];

const REFUSAL =
  /(don't|do not|doesn't|can't|cannot) (know|have|see|access)|no (record|information|details)|not sure|unable to|不知道|没有(提到|记录|相关|信息)|无法|不清楚/i;

const MODELS = {
  extract: "gpt-4o-mini (temperature 0.2)",
  chatInject: "gpt-4o-mini (temperature 0.6)",
  chatAgent: "gpt-4o-mini (temperature 0.2 with tools)",
  embeddings: "text-embedding-3-small",
  heuristic: "lib/heuristicExtract.js keyword baseline"
};

const nodes = JSON.parse(readFileSync(join(root, "eval/fixture.json"), "utf8"));
const extractionCases = HELDOUT ? loadHeldout() : JSON.parse(readFileSync(join(root, "eval/extraction.json"), "utf8"));
const qaCases = HELDOUT ? [] : JSON.parse(readFileSync(join(root, "eval/qa.json"), "utf8"));
const outline = formatOutline(nodes);

function loadHeldout() {
  if (!existsSync(HELDOUT_FILE)) {
    console.error(`Held-out file not found: ${HELDOUT_FILE}`);
    console.error("Write eval/heldout.json in the same format as eval/extraction.json, then run again.");
    process.exit(1);
  }
  let cases;
  try {
    cases = JSON.parse(readFileSync(HELDOUT_FILE, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`Held-out file is not valid JSON: ${errorMessage(error)}`);
    process.exit(1);
  }
  const problems = [];
  if (!Array.isArray(cases) || !cases.length) problems.push("expected a non-empty array");
  const fixtureIds = new Set(nodes.map((node) => node.id));
  for (const [index, item] of (Array.isArray(cases) ? cases : []).entries()) {
    const label = item?.id || `#${index + 1}`;
    if (!item?.id) problems.push(`${label}: missing id`);
    if (!String(item?.text || "").trim()) problems.push(`${label}: missing text`);
    if (!DECISIONS.includes(item?.goldDecision)) problems.push(`${label}: goldDecision "${item?.goldDecision}" is not a decision`);
    for (const id of item?.existingContext || []) {
      if (!fixtureIds.has(id)) problems.push(`${label}: existingContext id ${id} is not in eval/fixture.json`);
    }
  }
  if (problems.length) {
    console.error("Held-out file has problems:");
    for (const line of problems) console.error(`- ${line}`);
    process.exit(1);
  }
  return cases;
}

function readPrompt(relativePath, name) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const marker = `const ${name} = \``;
  const start = source.indexOf(marker);
  if (start < 0) {
    console.error(`Could not find ${name} in ${relativePath}.`);
    process.exit(1);
  }
  let end = start + marker.length;
  while (end < source.length) {
    if (source[end] === "\\") {
      end += 2;
      continue;
    }
    if (source[end] === "`") break;
    end += 1;
  }
  if (source[end] !== "`") {
    console.error(`Unterminated ${name} in ${relativePath}.`);
    process.exit(1);
  }
  return source.slice(start + marker.length, end);
}

function assertNoPromptLeak() {
  const prompts = [
    ["EXTRACT_PROMPT", readPrompt("app/api/memory/extract/route.js", "EXTRACT_PROMPT")],
    ["AGENT_PROMPT", readPrompt("app/api/chat/route.js", "AGENT_PROMPT")],
    ["REORGANIZE_PROMPT", readPrompt("app/api/memory/reorganize/route.js", "REORGANIZE_PROMPT")]
  ];
  const leaks = [];
  for (const item of extractionCases) {
    const text = String(item.text || "").trim().toLowerCase();
    if (!text) continue;
    for (const [name, prompt] of prompts) {
      if (prompt.toLowerCase().includes(text)) leaks.push(`${item.id} appears in ${name}: ${item.text}`);
    }
  }
  if (leaks.length) {
    console.error("Extraction text leaked into a prompt. Refusing to run.");
    for (const line of leaks) console.error(line);
    process.exit(1);
  }
}

async function main() {
  assertNoPromptLeak();
  await assertServer();
  console.log(`fixture ${nodes.length} nodes, ${extractionCases.length} extraction turns, ${qaCases.length} questions`);
  console.log("");

  const { heuristicRows, liveRows } = await runExtraction();

  if (HELDOUT) {
    const report = {
      date: new Date().toISOString().slice(0, 10),
      commit: gitCommit(),
      base: BASE,
      models: MODELS,
      counts: { nodes: nodes.length, extractionTurns: extractionCases.length },
      note: "Each turn was sent once at the server's normal temperature. Results vary run to run. The held-out set is for reporting only. Prompts, labels and normalization are not tuned against it.",
      extraction: {
        heuristic: summarizeDecisions(heuristicRows),
        live: summarizeDecisions(liveRows)
      }
    };
    writeFileSync(join(root, "eval/results-heldout.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(root, "eval/results-heldout.md"), renderHeldoutMarkdown(report));
    console.log("");
    console.log("wrote eval/results-heldout.md and eval/results-heldout.json");
    return;
  }

  const qa = {};
  for (const mode of ["off", "inject", "agent"]) {
    console.log("");
    qa[mode] = [];
    for (const [index, item] of qaCases.entries()) {
      console.log(`[qa ${mode} ${index + 1}/${qaCases.length}] ${item.id} ${clip(item.question, 60)}`);
      const started = Date.now();
      try {
        const body = await postJson("/api/chat", {
          messages: [{ role: "user", content: item.question }],
          nodes,
          memoryMode: mode
        });
        const reply = String(body.content || "");
        const used = Array.isArray(body.usedMemories) ? body.usedMemories : [];
        const relevant = new Set(item.relevantMemoryIds || []);
        qa[mode].push({
          id: item.id,
          question: item.question,
          lang: item.lang,
          needsMemory: Boolean(item.needsMemory),
          error: null,
          ms: Date.now() - started,
          mode: body.mode || "",
          warning: body.warning || "",
          usedMemoryIds: used.map((memory) => memory?.id).filter(Boolean),
          irrelevant: used.filter((memory) => memory?.id && !relevant.has(memory.id)).length,
          correct: item.needsMemory ? answerCorrect(reply, item) : null,
          emptyUsed: used.length === 0,
          toolCalls: Array.isArray(body.trace) ? body.trace.length : 0,
          reply: clip(reply, 500)
        });
      } catch (error) {
        qa[mode].push({
          id: item.id,
          question: item.question,
          lang: item.lang,
          needsMemory: Boolean(item.needsMemory),
          error: errorMessage(error),
          ms: Date.now() - started,
          usedMemoryIds: [],
          irrelevant: null,
          correct: null,
          emptyUsed: null,
          toolCalls: null,
          reply: ""
        });
      }
    }
  }

  const report = {
    date: new Date().toISOString().slice(0, 10),
    base: BASE,
    models: MODELS,
    counts: {
      nodes: nodes.length,
      memories: nodes.filter((node) => node.type === "memory").length,
      extractionTurns: extractionCases.length,
      questions: qaCases.length,
      needsMemory: qaCases.filter((item) => item.needsMemory).length,
      noMemory: qaCases.filter((item) => !item.needsMemory).length
    },
    note: "Each question was sent once at the server's normal temperature. Results vary run to run.",
    extraction: {
      heuristic: summarizeDecisions(heuristicRows),
      live: summarizeDecisions(liveRows)
    },
    qa: {
      off: summarizeQa(qa.off, false),
      inject: summarizeQa(qa.inject, false),
      agent: summarizeQa(qa.agent, true)
    }
  };

  writeFileSync(join(root, "eval/results.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(root, "eval/results.md"), renderMarkdown(report));
  console.log("");
  console.log("wrote eval/results.md and eval/results.json");
}

function gitCommit() {
  try {
    const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const hash = run(["rev-parse", "--short", "HEAD"]);
    const dirty = run(["status", "--porcelain"]).length > 0;
    return dirty ? `${hash} (uncommitted changes)` : hash;
  } catch {
    return "unknown (not a git checkout)";
  }
}

async function runExtraction() {
  const heuristicRows = [];
  for (const [index, item] of extractionCases.entries()) {
    console.log(`[heuristic ${index + 1}/${extractionCases.length}] ${item.id} ${clip(item.text, 60)}`);
    try {
      const result = heuristicExtract(item.text, nodes);
      heuristicRows.push(rowFromDecision(item, result?.decision || "", null, result?.operations));
    } catch (error) {
      heuristicRows.push(rowFromDecision(item, "", errorMessage(error)));
    }
  }

  const liveRows = [];
  for (const [index, item] of extractionCases.entries()) {
    console.log(`[extract ${index + 1}/${extractionCases.length}] ${item.id} ${clip(item.text, 60)}`);
    const started = Date.now();
    try {
      const body = await postJson("/api/memory/extract", {
        userMessage: { content: item.text },
        assistantMessage: { content: "" },
        outline,
        nodes,
        debug: true
      });
      const rawOperations = Array.isArray(body.raw?.operations) ? body.raw.operations : [];
      liveRows.push({
        ...rowFromDecision(item, body.decision || "", null, body.operations),
        ms: Date.now() - started,
        mode: body.mode || "",
        rawDecision: typeof body.raw?.decision === "string" ? body.raw.decision : "",
        rawOperationTypes: rawOperations.map((op) => (typeof op?.type === "string" ? op.type : "")),
        rawOperations: rawOperations.map((op) => ({
          type: typeof op?.type === "string" ? op.type : "",
          id: op?.id || op?.existingMemoryId || "",
          title: typeof op?.title === "string" ? op.title : "",
          content: typeof (op?.newContent || op?.content) === "string" ? (op.newContent || op.content).slice(0, 240) : ""
        })),
        dropped: Array.isArray(body.dropped) ? body.dropped : []
      });
    } catch (error) {
      liveRows.push({
        ...rowFromDecision(item, "", errorMessage(error)),
        ms: Date.now() - started,
        rawDecision: "",
        rawOperationTypes: [],
        dropped: []
      });
    }
  }

  return { heuristicRows, liveRows };
}

function rowFromDecision(item, predicted, error, operations) {
  const alternatives = Array.isArray(item.goldAlternatives) ? item.goldAlternatives : [];
  const decision = predicted || "";
  return {
    id: item.id,
    text: item.text,
    gold: item.goldDecision,
    alternatives,
    predicted: decision,
    match: !error && decision === item.goldDecision,
    lenient: !error && (decision === item.goldDecision || alternatives.includes(decision)),
    category: error ? null : categoryPlacement(item, operations),
    error
  };
}

function categoryPlacement(item, operations) {
  const expected = item.expectedPathIncludes;
  const forbidden = item.forbiddenPathIncludes;
  if (!expected && !forbidden) return null;
  const paths = [];
  for (const op of operations || []) {
    if (Array.isArray(op?.path) && op.path.length) paths.push(op.path.map(String).join(" "));
    else if (typeof op?.path === "string" && op.path.trim()) paths.push(op.path);
  }
  const blob = paths.join(" ").toLowerCase();
  const hasExpected = (expected || []).every((part) => blob.includes(String(part).toLowerCase()));
  const avoidsForbidden = (forbidden || []).every((part) => !blob.includes(String(part).toLowerCase()));
  return paths.length > 0 && hasExpected && avoidsForbidden;
}

function summarizeDecisions(rows) {
  const scored = rows.filter((row) => !row.error);
  const perDecision = {};
  for (const decision of DECISIONS) {
    const subset = scored.filter((row) => row.gold === decision);
    const hits = subset.filter((row) => row.match).length;
    perDecision[decision] = { correct: hits, total: subset.length, rate: rate(hits, subset.length) };
  }
  const matrix = {};
  for (const gold of DECISIONS) {
    matrix[gold] = {};
    for (const predicted of [...DECISIONS, "other"]) matrix[gold][predicted] = 0;
  }
  for (const row of scored) {
    const gold = DECISIONS.includes(row.gold) ? row.gold : "other";
    if (!matrix[gold]) continue;
    const predicted = DECISIONS.includes(row.predicted) ? row.predicted : "other";
    matrix[gold][predicted] += 1;
  }
  const correct = scored.filter((row) => row.match).length;
  const lenientHits = scored.filter((row) => row.lenient).length;
  const outcomeHits = scored.filter((row) => {
    const gold = outcomeOf(row.gold);
    return gold && gold === outcomeOf(row.predicted);
  }).length;
  const placed = scored.filter((row) => typeof row.category === "boolean");
  const placedHits = placed.filter((row) => row.category).length;
  return {
    correct,
    total: scored.length,
    errors: rows.length - scored.length,
    rate: rate(correct, scored.length),
    lenient: { correct: lenientHits, total: scored.length, rate: rate(lenientHits, scored.length) },
    outcome: { correct: outcomeHits, total: scored.length, rate: rate(outcomeHits, scored.length) },
    categoryPlacement: { correct: placedHits, total: placed.length, rate: rate(placedHits, placed.length) },
    perDecision,
    matrix,
    rows
  };
}

function summarizeQa(rows, includeTools) {
  const ok = rows.filter((row) => !row.error);
  const remembered = ok.filter((row) => row.needsMemory);
  const correct = remembered.filter((row) => row.correct).length;
  const irrelevantValues = ok.map((row) => row.irrelevant).filter((value) => Number.isFinite(value));
  const noMemory = ok.filter((row) => !row.needsMemory);
  const empty = noMemory.filter((row) => row.emptyUsed).length;
  const summary = {
    errors: rows.length - ok.length,
    answerCorrectness: { correct, total: remembered.length, rate: rate(correct, remembered.length) },
    irrelevantMemories: {
      average: irrelevantValues.length
        ? irrelevantValues.reduce((sum, value) => sum + value, 0) / irrelevantValues.length
        : null,
      questions: irrelevantValues.length
    },
    noMemoryEmpty: { correct: empty, total: noMemory.length, rate: rate(empty, noMemory.length) },
    latencyMs: average(ok.map((row) => row.ms)),
    rows
  };
  if (includeTools) {
    summary.toolCalls = { average: average(ok.map((row) => row.toolCalls)) };
  }
  return summary;
}

function outcomeOf(decision) {
  if (decision === "duplicate" || decision === "not_remembered") return "no_change";
  if (decision === "suggested" || decision === "related") return "new_memory";
  if (decision === "update" || decision === "refinement") return "modify_existing";
  if (decision === "conflict") return "conflict";
  return "";
}

function answerCorrect(reply, item) {
  const raw = String(reply || "");
  if (item.rejectRefusal && REFUSAL.test(raw)) return false;
  const text = raw.toLowerCase();
  const mentioned = (item.mustMention || []).every((group) =>
    group.some((term) => text.includes(String(term).toLowerCase()))
  );
  const clean = (item.mustNotMention || []).every((term) => !text.includes(String(term).toLowerCase()));
  return mentioned && clean;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Evaluation results");
  lines.push("");
  lines.push(`Date: ${report.date}`);
  lines.push("");
  lines.push("Models:");
  lines.push("");
  lines.push(`- Extraction: ${report.models.extract}`);
  lines.push(`- Inject chat: ${report.models.chatInject}`);
  lines.push(`- Agent chat: ${report.models.chatAgent}`);
  lines.push(`- Embeddings: ${report.models.embeddings}`);
  lines.push(`- Baseline: ${report.models.heuristic}`);
  lines.push("");
  lines.push(
    `Counts: ${report.counts.extractionTurns} extraction turns, ${report.counts.questions} questions (${report.counts.needsMemory} need memory, ${report.counts.noMemory} do not), ${report.counts.memories} fixture memories.`
  );
  lines.push("");
  lines.push(report.note);
  lines.push("");
  pushExtraction(lines, report.extraction);
  lines.push("## Memory-grounded QA");
  lines.push("");
  lines.push("| mode | answer correctness | irrelevant memories (avg) | no-memory questions with empty usedMemories | latency ms | tool calls (avg) | errors |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const mode of ["off", "inject", "agent"]) {
    const part = report.qa[mode];
    const tools = part.toolCalls ? part.toolCalls.average.toFixed(2) : "—";
    lines.push(
      `| ${mode} | ${formatAccuracy(part.answerCorrectness)} | ${formatAverage(part.irrelevantMemories.average)} | ${formatAccuracy(part.noMemoryEmpty)} | ${formatAverage(part.latencyMs)} | ${tools} | ${part.errors} |`
    );
  }
  lines.push("");
  lines.push("Answer correctness is the share of needsMemory questions whose reply contains every mustMention group and none of mustNotMention. A reply that refuses also fails when rejectRefusal is set. Irrelevant memories are the average count of usedMemories outside relevantMemoryIds. The no-memory column is the share of needsMemory=false questions that returned no usedMemories.");
  lines.push("");
  const baseline = report.qa.off.answerCorrectness;
  lines.push(`No-memory baseline (Off-mode correctness on needsMemory questions): ${formatAccuracy(baseline)}`);
  if (baseline?.rate != null && baseline.rate > 0.3) {
    lines.push("");
    lines.push("Warning: Off-mode correctness is above 0.30. Labels may leak answers.");
  }
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  lines.push("Labels are author-written. The set is small. This file is a single run at the app's normal temperature, and the model is nondeterministic, so a later run will not match these numbers exactly.");
  lines.push("");
  return lines.join("\n");
}

function renderHeldoutMarkdown(report) {
  const lines = [];
  lines.push("# Held-out extraction results");
  lines.push("");
  lines.push(`Date: ${report.date}`);
  lines.push("");
  lines.push(`Commit: ${report.commit}`);
  lines.push("");
  lines.push(`Extraction model: ${report.models.extract}`);
  lines.push("");
  lines.push(`Baseline: ${report.models.heuristic}`);
  lines.push("");
  lines.push(`Counts: ${report.counts.extractionTurns} held-out turns, ${report.counts.nodes} fixture nodes (eval/fixture.json).`);
  lines.push("");
  lines.push(report.note);
  lines.push("");
  pushExtraction(lines, report.extraction);
  lines.push("## Limitations");
  lines.push("");
  lines.push("Labels are author-written. The set is small. This file is a single run at the app's normal temperature, and the model is nondeterministic, so a later run will not match these numbers exactly.");
  lines.push("");
  return lines.join("\n");
}

function pushExtraction(lines, extraction) {
  lines.push("## Extraction");
  lines.push("");
  lines.push("| system | strict accuracy | lenient accuracy | outcome accuracy | category placement | errors |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const [label, part] of [
    ["Heuristic baseline", extraction.heuristic],
    ["Live extractor", extraction.live]
  ]) {
    lines.push(
      `| ${label} | ${formatAccuracy(part)} | ${formatAccuracy(part.lenient)} | ${formatAccuracy(part.outcome)} | ${formatAccuracy(part.categoryPlacement)} | ${part.errors} |`
    );
  }
  lines.push("");
  lines.push("Strict accuracy counts only goldDecision. Lenient accuracy also accepts goldAlternatives. Outcome accuracy maps both labels into no_change (duplicate, not_remembered), new_memory (suggested, related), modify_existing (update, refinement), or conflict. Category placement is scored only on turns that set expectedPathIncludes or forbiddenPathIncludes, from the path of the suggested operation, and is separate from decision accuracy.");
  lines.push("");
  lines.push("### Per decision");
  lines.push("");
  lines.push("| decision | heuristic | live |");
  lines.push("| --- | --- | --- |");
  for (const decision of DECISIONS) {
    lines.push(
      `| ${decision} | ${formatAccuracy(extraction.heuristic.perDecision[decision])} | ${formatAccuracy(extraction.live.perDecision[decision])} |`
    );
  }
  lines.push("");
  lines.push("### Confusion matrix, heuristic");
  lines.push("");
  lines.push(matrixTable(extraction.heuristic.matrix));
  lines.push("");
  lines.push("### Confusion matrix, live");
  lines.push("");
  lines.push(matrixTable(extraction.live.matrix));
  lines.push("");
  lines.push("### Live mismatches");
  lines.push("");
  const mismatches = extraction.live.rows.filter((row) => row.predicted !== row.gold);
  if (!mismatches.length) {
    lines.push("None.");
    lines.push("");
  } else {
    lines.push("| id | text | gold | rawDecision | predicted | dropped |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of mismatches) {
      lines.push(
        `| ${cell(row.id)} | ${cell(clip(row.text, 80))} | ${cell(row.gold)} | ${cell(row.rawDecision || "—")} | ${cell(row.predicted || "—")} | ${cell(formatDrops(row.dropped))} |`
      );
    }
    lines.push("");
  }
}

function matrixTable(matrix) {
  const columns = [...DECISIONS, "other"];
  const header = `| gold \\ predicted | ${columns.join(" | ")} |`;
  const rule = `| --- | ${columns.map(() => "---").join(" | ")} |`;
  const body = DECISIONS.map((gold) => `| ${gold} | ${columns.map((predicted) => matrix[gold][predicted]).join(" | ")} |`);
  return [header, rule, ...body].join("\n");
}

function formatOutline(list) {
  const children = new Map();
  for (const node of list) {
    const key = node.parentId || "";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  function walk(parentId, depth) {
    const lines = [];
    for (const child of children.get(parentId || "") || []) {
      const body = child.content ? `: ${child.content}` : "";
      lines.push(
        `${"  ".repeat(depth)}- [${child.type}/${child.state || "confirmed"}] ${child.title}${body} (id: ${child.id})`
      );
      lines.push(...walk(child.id, depth + 1));
    }
    return lines;
  }
  return walk(null, 0).join("\n");
}

function formatDrops(dropped) {
  if (!Array.isArray(dropped) || !dropped.length) return "—";
  return dropped
    .map((item) => {
      const type = item?.type || "operation";
      const id = item?.id ? ` ${item.id}` : "";
      return `${type}${id}: ${item?.reason || ""}`;
    })
    .join("; ");
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
}

function formatAccuracy(part) {
  if (!part || !part.total) return "n/a";
  return `${part.correct}/${part.total} (${part.rate.toFixed(2)})`;
}

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

function rate(hits, total) {
  return total ? hits / total : null;
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function errorMessage(error) {
  return error?.message || String(error);
}

async function assertServer() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    console.error(`Dev server is not reachable at ${BASE}. Start it with npm run dev.`);
    console.error(errorMessage(error));
    process.exit(1);
  }
}

async function postJson(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!response.ok) {
    throw new Error(data.warning || data.error || `HTTP ${response.status}`);
  }
  return data;
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
