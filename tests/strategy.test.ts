import { describe, expect, it } from "vitest";
import type { OddsTick } from "../shared/types";
import { runStrategy } from "../server/strategy";

const at = (minute: number, probs: [number, number, number], score: [number, number], extras: Partial<OddsTick> = {}): OddsTick => ({
  fixtureId: 1,
  messageId: `msg-${minute}`,
  ts: Date.UTC(2026, 6, 18, 21, minute),
  inRunning: true,
  suspended: false,
  prices: probs.map((probability) => Math.round(100_000 / probability)) as [number, number, number],
  probabilities: probs,
  score,
  ...extras,
});

describe("consensus shock strategy", () => {
  it("arms, confirms, enters and takes profit without human input", () => {
    const run = runStrategy([
      at(0, [35, 25, 40], [0, 0]),
      at(5, [17, 20, 63], [0, 2]),
      at(10, [16, 19, 65], [0, 2]),
      at(15, [4, 9, 87], [0, 3]),
    ]);
    expect(run.decisions.map((decision) => decision.action)).toEqual(["observe", "arm", "enter", "exit"]);
    expect(run.metrics.trades).toBe(1);
    expect(run.metrics.realisedPnl).toBeGreaterThan(0);
  });

  it("does not trade an odds shock that conflicts with score context", () => {
    const run = runStrategy([
      at(0, [35, 25, 40], [0, 1]),
      at(5, [55, 25, 20], [0, 1]),
      at(10, [57, 24, 19], [0, 1]),
    ]);
    expect(run.metrics.trades).toBe(0);
    expect(run.decisions.every((decision) => decision.action !== "enter")).toBe(true);
  });

  it("halts deterministically on a suspended market", () => {
    const run = runStrategy([
      at(0, [35, 25, 40], [0, 0]),
      at(5, [35, 25, 40], [0, 0], { suspended: true, prices: [0, 0, 0] }),
    ]);
    expect(run.decisions.at(-1)?.action).toBe("halt");
    expect(run.metrics.haltedTicks).toBe(1);
  });

  it("produces the same audit chain for identical inputs", () => {
    const ticks = [at(0, [35, 25, 40], [0, 0]), at(5, [17, 20, 63], [0, 2])];
    expect(runStrategy(ticks).decisions).toEqual(runStrategy(ticks).decisions);
  });
});
