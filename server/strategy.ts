import type {
  AgentAction,
  DecisionRecord,
  OddsTick,
  Outcome,
  Position,
  RiskPolicy,
} from "../shared/types.js";
import { sha256 } from "./hash.js";

export const defaultPolicy: RiskPolicy = {
  bankroll: 10_000,
  shockThreshold: 0.12,
  confirmationFloor: 0.02,
  maxPositionPct: 0.02,
  maxDrawdownPct: 0.03,
  stopLossProbability: 0.08,
  takeProfitProbability: 0.15,
  maxHoldTicks: 4,
};

const sides: Outcome[] = ["participant-1", "draw", "participant-2"];

interface PendingSignal {
  side: Outcome;
  probability: number;
  shock: number;
  ts: number;
}

function winnerFromScore(score: [number, number]): Outcome | undefined {
  if (score[0] === score[1]) return score[0] > 0 ? "draw" : undefined;
  return score[0] > score[1] ? "participant-1" : "participant-2";
}

function probabilityFor(tick: OddsTick, side: Outcome): number {
  return tick.probabilities[sides.indexOf(side)] / 100;
}

function fractionalKelly(marketProbability: number, shock: number, policy: RiskPolicy): number {
  const projected = Math.min(0.98, marketProbability + Math.max(policy.confirmationFloor, shock * 0.18));
  const decimalOdds = 1 / marketProbability;
  const netOdds = decimalOdds - 1;
  const fullKelly = Math.max(0, (netOdds * projected - (1 - projected)) / netOdds);
  return Math.min(policy.maxPositionPct, fullKelly * 0.25);
}

export function runStrategy(ticks: OddsTick[], policy: RiskPolicy = defaultPolicy): {
  decisions: DecisionRecord[];
  metrics: {
    trades: number;
    signals: number;
    realisedPnl: number;
    returnPct: number;
    maxDrawdownPct: number;
    finalEquity: number;
    haltedTicks: number;
  };
} {
  let equity = policy.bankroll;
  let peakEquity = equity;
  let maxDrawdown = 0;
  let realisedPnl = 0;
  let position: Position | undefined;
  let pending: PendingSignal | undefined;
  let previousHash = "0".repeat(64);
  let signals = 0;
  let trades = 0;
  let haltedTicks = 0;
  const decisions: DecisionRecord[] = [];

  const record = (
    tick: OddsTick,
    action: AgentAction,
    side: Outcome | undefined,
    shock: number,
    reason: string,
    checks: Array<{ label: string; passed: boolean }>,
    extras: { stake?: number; pnl?: number } = {},
  ) => {
    const probability = side ? probabilityFor(tick, side) : Math.max(...tick.probabilities) / 100;
    const body = {
      sequence: decisions.length + 1,
      ts: tick.ts,
      action,
      side,
      probability,
      shock,
      score: tick.score,
      stake: extras.stake,
      pnl: extras.pnl,
      equity,
      reason,
      checks,
      messageId: tick.messageId,
      previousHash,
    };
    const decisionHash = sha256(body);
    decisions.push({ ...body, decisionHash });
    previousHash = decisionHash;
  };

  for (let index = 0; index < ticks.length; index += 1) {
    const tick = ticks[index];
    const previous = ticks[index - 1];
    const fresh = !previous || tick.ts - previous.ts <= 6 * 60_000;
    const complete = !tick.suspended && tick.prices.every((price) => Number.isFinite(price) && price > 1);
    const drawdownOk = (peakEquity - equity) / peakEquity < policy.maxDrawdownPct;
    const checks = [
      { label: "feed fresh", passed: fresh },
      { label: "market complete", passed: complete },
      { label: "drawdown budget", passed: drawdownOk },
    ];

    if (!fresh || !complete || !drawdownOk) {
      haltedTicks += 1;
      pending = undefined;
      record(
        tick,
        "halt",
        position?.side,
        0,
        !fresh ? "Feed gap exceeded six minutes." : !complete ? "Market suspension or incomplete quote detected." : "Maximum drawdown reached.",
        checks,
      );
      continue;
    }

    if (position) {
      position.ticksHeld += 1;
      const currentProbability = probabilityFor(tick, position.side);
      const probabilityMove = currentProbability - position.entryProbability;
      const markToMarket = position.shares * currentProbability - position.stake;
      const final = index === ticks.length - 1;
      const shouldExit = probabilityMove >= policy.takeProfitProbability
        || probabilityMove <= -policy.stopLossProbability
        || position.ticksHeld >= policy.maxHoldTicks
        || final;

      if (shouldExit) {
        equity += markToMarket;
        realisedPnl += markToMarket;
        peakEquity = Math.max(peakEquity, equity);
        maxDrawdown = Math.max(maxDrawdown, (peakEquity - equity) / peakEquity);
        const exitAction = final
          && probabilityMove < policy.takeProfitProbability
          && probabilityMove > -policy.stopLossProbability
          ? "settle"
          : "exit";
        record(
          tick,
          exitAction,
          position.side,
          probabilityMove,
          probabilityMove >= policy.takeProfitProbability
            ? "Take-profit probability move reached."
            : probabilityMove <= -policy.stopLossProbability
              ? "Stop-loss probability move reached."
              : final ? "Replay window closed; position marked to final quote." : "Maximum holding window reached.",
          checks,
          { pnl: markToMarket },
        );
        position = undefined;
      } else {
        record(tick, "hold", position.side, probabilityMove, "Open position remains inside exit bands.", checks, { pnl: markToMarket });
      }
      continue;
    }

    if (!previous || previous.inRunning !== tick.inRunning) {
      pending = undefined;
      record(tick, "observe", undefined, 0, previous ? "Pre-match to in-play boundary reset." : "Warm-up sample established.", checks);
      continue;
    }

    const movements = tick.probabilities.map((value, movementIndex) => (value - previous.probabilities[movementIndex]) / 100);
    const strongestIndex = movements.reduce((best, value, movementIndex) => value > movements[best] ? movementIndex : best, 0);
    const side = sides[strongestIndex];
    const shock = movements[strongestIndex];
    const scoreLeader = winnerFromScore(tick.score);
    const contextAligned = scoreLeader === side || (side === "draw" && tick.score[0] === tick.score[1]);
    const strategyChecks = [...checks, { label: "score context aligned", passed: contextAligned }];

    if (pending) {
      const currentProbability = probabilityFor(tick, pending.side);
      const sustained = currentProbability >= pending.probability - policy.confirmationFloor;
      const timely = tick.ts - pending.ts <= 6 * 60_000;
      const pendingAligned = winnerFromScore(tick.score) === pending.side;
      const confirmationChecks = [
        ...checks,
        { label: "shock sustained", passed: sustained },
        { label: "confirmed next interval", passed: timely },
        { label: "score context aligned", passed: pendingAligned },
      ];
      if (sustained && timely && pendingAligned) {
        const fraction = fractionalKelly(currentProbability, pending.shock, policy);
        const stake = Math.round(equity * fraction * 100) / 100;
        if (stake > 0) {
          position = {
            side: pending.side,
            entryTs: tick.ts,
            entryProbability: currentProbability,
            entryPrice: tick.prices[sides.indexOf(pending.side)] / 1000,
            stake,
            shares: stake / currentProbability,
            messageId: tick.messageId,
            ticksHeld: 0,
          };
          trades += 1;
          record(tick, "enter", pending.side, pending.shock, "Confirmed consensus shock passed fractional-Kelly and risk gates.", confirmationChecks, { stake });
          pending = undefined;
          continue;
        }
      }
      pending = undefined;
      record(tick, "observe", side, shock, "Candidate shock failed confirmation; no position opened.", confirmationChecks);
      continue;
    }

    if (shock >= policy.shockThreshold && contextAligned) {
      signals += 1;
      pending = { side, probability: probabilityFor(tick, side), shock, ts: tick.ts };
      record(tick, "arm", side, shock, "Consensus shock crossed threshold; waiting one interval for persistence.", strategyChecks);
    } else {
      record(tick, "observe", side, shock, "No executable shock after context and risk checks.", strategyChecks);
    }
  }

  return {
    decisions,
    metrics: {
      trades,
      signals,
      realisedPnl: Math.round(realisedPnl * 100) / 100,
      returnPct: Math.round((realisedPnl / policy.bankroll) * 10_000) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 10_000) / 100,
      finalEquity: Math.round(equity * 100) / 100,
      haltedTicks,
    },
  };
}
