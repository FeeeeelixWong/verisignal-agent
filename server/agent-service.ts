import type { AgentRun } from "../shared/types.js";
import { verifyOddsOnChain } from "./chain-verifier.js";
import { dataNetwork, loadReplayFeed, oddsProof, showcase } from "./data-service.js";
import { sha256 } from "./hash.js";
import { defaultPolicy, runStrategy } from "./strategy.js";

export async function runAgent(): Promise<AgentRun> {
  const feed = await loadReplayFeed();
  const result = runStrategy(feed.ticks, defaultPolicy);
  const entry = result.decisions.find((decision) => decision.action === "enter");
  let proof: AgentRun["proof"] = {
    status: feed.mode === "reference-simulation" ? "reference" : "not-run",
    programId: dataNetwork === "devnet"
      ? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
      : "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    messageId: entry?.messageId,
  };
  if (entry && feed.mode === "txline-replay") {
    const payload = await oddsProof(entry.messageId, entry.ts);
    proof = await verifyOddsOnChain(payload as any);
  }
  const auditHead = result.decisions[result.decisions.length - 1]?.decisionHash || "0".repeat(64);
  const runId = `vs_${sha256({ fixtureId: feed.fixture.fixtureId, policy: defaultPolicy, auditHead }).slice(0, 20)}`;
  return {
    runId,
    mode: feed.mode,
    generatedAt: new Date().toISOString(),
    fixture: feed.fixture,
    strategy: "Confirmed Consensus Shock / quarter-Kelly / bounded risk",
    policy: defaultPolicy,
    source: {
      provider: "TxLINE",
      network: dataNetwork,
      oddsEndpoint: feed.oddsEndpoint,
      scoresEndpoint: feed.scoresEndpoint,
      recordsRead: feed.recordsRead,
      replayWindow: feed.mode === "txline-replay"
        ? [showcase.start, showcase.end]
        : [feed.ticks[0].ts, feed.ticks[feed.ticks.length - 1].ts],
    },
    timeline: feed.ticks,
    decisions: result.decisions,
    metrics: result.metrics,
    proof,
    auditHead,
    disclaimer: "Paper-execution research tool. No custody, wagering, or live capital deployment.",
  };
}
