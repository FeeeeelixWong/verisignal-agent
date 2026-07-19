import type { AgentRun, Fixture, OddsTick } from "../shared/types.js";
import { hasLiveCredentials, txlineConfig } from "./config.js";
import { normalizeFixture, normalizeOddsWindow, parseScoreStream } from "./normalize.js";
import { referenceFixture, referenceTicks } from "./reference.js";
import { txlineGet, txlineText } from "./txline-client.js";

export const showcase = {
  fixtureId: 18257865,
  start: Date.parse("2026-07-18T20:30:00.000Z"),
  end: Date.parse("2026-07-18T23:00:00.000Z"),
};

interface ReplayFeed {
  mode: AgentRun["mode"];
  fixture: Fixture;
  ticks: OddsTick[];
  recordsRead: number;
  oddsEndpoint: string;
  scoresEndpoint: string;
}

async function fixtureById(fixtureId: number): Promise<Fixture> {
  const startEpochDay = Math.floor((showcase.start - 30 * 86_400_000) / 86_400_000);
  const fixtures = await txlineGet<Array<Record<string, any>>>(`/fixtures/snapshot?startEpochDay=${startEpochDay}`);
  const fixture = fixtures.find((item) => Number(item.FixtureId ?? item.fixtureId) === fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId} is not available from TxLINE`);
  return normalizeFixture(fixture);
}

async function replayFromTxline(): Promise<ReplayFeed> {
  const fixture = await fixtureById(showcase.fixtureId);
  const scoreText = await txlineText(`/scores/historical/${showcase.fixtureId}`);
  const scoreMarks = parseScoreStream(scoreText, fixture.startTime);
  const windows = Array.from(
    { length: Math.floor((showcase.end - showcase.start) / 300_000) + 1 },
    (_, index) => showcase.start + index * 300_000,
  );
  let recordsRead = 0;
  const ticks = (await Promise.all(windows.map(async (timestamp) => {
    const date = new Date(timestamp);
    const epochDay = Math.floor(timestamp / 86_400_000);
    const interval = Math.floor(date.getUTCMinutes() / 5);
    const path = `/odds/updates/${epochDay}/${date.getUTCHours()}/${interval}?fixtureId=${showcase.fixtureId}`;
    const records = await txlineGet<Array<Record<string, any>>>(path);
    recordsRead += records.length;
    return normalizeOddsWindow(records, showcase.fixtureId, scoreMarks, timestamp);
  }))).filter((tick): tick is OddsTick => Boolean(tick));

  if (ticks.length < 8) throw new Error("TxLINE replay returned too few 1X2 samples");
  return {
    mode: "txline-replay",
    fixture,
    ticks,
    recordsRead,
    oddsEndpoint: "/api/odds/updates/{epochDay}/{hour}/{interval}",
    scoresEndpoint: `/api/scores/historical/${showcase.fixtureId}`,
  };
}

function referenceFeed(): ReplayFeed {
  return {
    mode: "reference-simulation",
    fixture: referenceFixture,
    ticks: referenceTicks,
    recordsRead: referenceTicks.length,
    oddsEndpoint: "generated reference sequence",
    scoresEndpoint: "generated reference score marks",
  };
}

export async function loadReplayFeed(): Promise<ReplayFeed> {
  if (!hasLiveCredentials) return referenceFeed();
  try {
    return await replayFromTxline();
  } catch (error) {
    console.error("TxLINE replay unavailable", error);
    return referenceFeed();
  }
}

export async function oddsProof(messageId: string, ts: number): Promise<Record<string, any>> {
  return txlineGet(`/odds/validation?messageId=${encodeURIComponent(messageId)}&ts=${ts}`);
}

export const dataNetwork = txlineConfig.network;
