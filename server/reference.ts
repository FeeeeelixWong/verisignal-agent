import type { Fixture, OddsTick } from "../shared/types.js";

export const referenceFixture: Fixture = {
  fixtureId: 90000001,
  startTime: Date.UTC(2026, 6, 18, 21, 0),
  participant1: "Northbridge",
  participant2: "Southbank",
  competition: "Clearly labeled reference simulation",
  competitionId: 0,
};

const samples: Array<[[number, number, number], [number, number], boolean?]> = [
  [[55, 23, 22], [0, 0]],
  [[38, 25, 37], [0, 0]],
  [[35, 25, 40], [0, 1]],
  [[17, 20, 63], [0, 2]],
  [[16, 19, 65], [0, 2]],
  [[4, 9, 87], [0, 3]],
  [[0, 0, 0], [0, 3], true],
];

export const referenceTicks: OddsTick[] = samples.map(([probability, score, suspended], index) => ({
  fixtureId: referenceFixture.fixtureId,
  messageId: `reference-${index}`,
  ts: referenceFixture.startTime + index * 5 * 60_000,
  inRunning: index > 0,
  suspended: Boolean(suspended),
  probabilities: probability,
  prices: suspended
    ? [0, 0, 0]
    : probability.map((value) => Math.round(100_000 / value)) as [number, number, number],
  score,
}));
