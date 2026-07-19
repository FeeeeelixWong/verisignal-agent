import { createHash } from "node:crypto";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const healthResponse = await fetch(`${baseUrl}/api/health`);
assert(healthResponse.ok, `Health returned ${healthResponse.status}`);
const health = await healthResponse.json();
assert(health.ok === true, "Health body is not OK");
assert(health.autonomous === true, "Service does not report autonomous operation");

const agentResponse = await fetch(`${baseUrl}/api/agent?action=run`);
assert(agentResponse.ok, `Agent returned ${agentResponse.status}`);
const run = await agentResponse.json();
assert(run.mode === "txline-replay", `Expected txline-replay, received ${run.mode}`);
assert(run.source.provider === "TxLINE", "Unexpected data provider");
assert(run.source.recordsRead > 0, "No TxLINE records were read");
assert(run.timeline.length >= 8, "Replay timeline is too short");

const actions = run.decisions.map((decision) => decision.action);
for (const expected of ["arm", "enter", "hold", "exit", "halt"]) {
  assert(actions.includes(expected), `Autonomous path is missing ${expected.toUpperCase()}`);
}
assert(run.metrics.trades >= 1, "No paper trade was executed");
assert(run.metrics.realisedPnl > 0, "Showcase paper trade did not realize positive P&L");
assert(run.proof.status === "passed", `Solana odds proof is ${run.proof.status}`);
assert(run.proof.messageId, "Proof is missing its TxLINE message ID");
assert(run.proof.rootAccount, "Proof is missing the Solana root PDA");

let previousHash = "0".repeat(64);
for (const decision of run.decisions) {
  assert(decision.previousHash === previousHash, `Broken previousHash at action ${decision.sequence}`);
  const { decisionHash, ...body } = decision;
  assert(sha256(body) === decisionHash, `Invalid decisionHash at action ${decision.sequence}`);
  previousHash = decisionHash;
}
assert(run.auditHead === previousHash, "Audit head does not match the final decision");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  runId: run.runId,
  fixture: `${run.fixture.participant1} vs ${run.fixture.participant2}`,
  actions: [...new Set(actions.map((action) => action.toUpperCase()))],
  trades: run.metrics.trades,
  realisedPnl: run.metrics.realisedPnl,
  proof: run.proof.status,
  proofMessageId: run.proof.messageId,
  auditHead: run.auditHead,
}, null, 2));
