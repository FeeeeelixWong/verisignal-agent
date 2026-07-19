export type Outcome = "participant-1" | "draw" | "participant-2";
export type AgentAction = "observe" | "arm" | "enter" | "hold" | "exit" | "halt" | "settle";
export type RunMode = "txline-live" | "txline-replay" | "reference-simulation";

export interface Fixture {
  fixtureId: number;
  startTime: number;
  participant1: string;
  participant2: string;
  competition: string;
  competitionId: number;
}

export interface ScoreMark {
  seq: number;
  ts: number;
  action: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

export interface OddsTick {
  fixtureId: number;
  messageId: string;
  ts: number;
  inRunning: boolean;
  suspended: boolean;
  prices: [number, number, number];
  probabilities: [number, number, number];
  score: [number, number];
}

export interface RiskPolicy {
  bankroll: number;
  shockThreshold: number;
  confirmationFloor: number;
  maxPositionPct: number;
  maxDrawdownPct: number;
  stopLossProbability: number;
  takeProfitProbability: number;
  maxHoldTicks: number;
}

export interface Position {
  side: Outcome;
  entryTs: number;
  entryProbability: number;
  entryPrice: number;
  stake: number;
  shares: number;
  messageId: string;
  ticksHeld: number;
}

export interface DecisionRecord {
  sequence: number;
  ts: number;
  action: AgentAction;
  side?: Outcome;
  probability: number;
  shock: number;
  score: [number, number];
  stake?: number;
  pnl?: number;
  equity: number;
  reason: string;
  checks: Array<{ label: string; passed: boolean }>;
  messageId: string;
  previousHash: string;
  decisionHash: string;
}

export interface ChainProof {
  status: "passed" | "failed" | "not-run" | "reference";
  programId: string;
  rootAccount?: string;
  messageId?: string;
  payloadHash?: string;
  unitsConsumed?: number;
  proofDepth?: number;
}

export interface AgentRun {
  runId: string;
  mode: RunMode;
  generatedAt: string;
  fixture: Fixture;
  strategy: string;
  policy: RiskPolicy;
  source: {
    provider: "TxLINE";
    network: "devnet" | "mainnet";
    oddsEndpoint: string;
    scoresEndpoint: string;
    recordsRead: number;
    replayWindow: [number, number];
  };
  timeline: OddsTick[];
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
  proof: ChainProof;
  auditHead: string;
  disclaimer: string;
}
