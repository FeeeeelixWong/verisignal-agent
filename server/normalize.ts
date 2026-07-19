import type { Fixture, OddsTick, ScoreMark } from "../shared/types.js";

export function normalizeFixture(input: Record<string, any>): Fixture {
  return {
    fixtureId: Number(input.FixtureId ?? input.fixtureId),
    startTime: Number(input.StartTime ?? input.startTime),
    participant1: String(input.Participant1 ?? input.participant1 ?? "Participant 1"),
    participant2: String(input.Participant2 ?? input.participant2 ?? "Participant 2"),
    competition: String(input.Competition ?? input.competition ?? "World Cup"),
    competitionId: Number(input.CompetitionId ?? input.competitionId),
  };
}

function scoreValue(input: Record<string, any>, key: "1" | "2"): number {
  const fromStats = input.Stats?.[key] ?? input.stats?.[key];
  if (fromStats !== undefined) return Number(fromStats);
  const participant = key === "1" ? input.Score?.Participant1 : input.Score?.Participant2;
  return Number(participant?.Total?.Goals ?? 0);
}

export function parseScoreStream(text: string, startTime: number): ScoreMark[] {
  const parsed = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      try { return JSON.parse(line.slice(6)) as Record<string, any>; } catch { return undefined; }
    })
    .filter((record): record is Record<string, any> => Boolean(record));

  const useful = new Set(["game_started", "goal", "goal_cancelled", "halftime_finalised", "game_finalised"]);
  const marks: ScoreMark[] = [{ seq: -1, ts: startTime, action: "game_started", homeScore: 0, awayScore: 0, final: false }];
  for (const record of parsed.sort((left, right) => Number(left.Seq ?? left.seq) - Number(right.Seq ?? right.seq))) {
    const action = String(record.Action ?? record.action ?? "").toLowerCase();
    if (!useful.has(action)) continue;
    const mark: ScoreMark = {
      seq: Number(record.Seq ?? record.seq ?? 0),
      ts: Number(record.Ts ?? record.ts),
      action,
      homeScore: scoreValue(record, "1"),
      awayScore: scoreValue(record, "2"),
      final: action === "game_finalised" || Number(record.StatusId ?? record.statusId) === 100,
    };
    const previous = marks[marks.length - 1];
    if (!previous || previous.ts !== mark.ts || previous.action !== mark.action) marks.push(mark);
  }
  return marks.sort((left, right) => left.ts - right.ts || left.seq - right.seq);
}

function probabilities(record: Record<string, any>): [number, number, number] {
  const pct = record.Pct ?? record.pct;
  if (Array.isArray(pct) && pct.length === 3 && pct.every((value) => Number.isFinite(Number(value)))) {
    return pct.map((value) => Number(Number(value).toFixed(3))) as [number, number, number];
  }
  const rawPrices = (record.Prices ?? record.prices ?? []).map(Number);
  if (rawPrices.length !== 3 || rawPrices.some((value: number) => value <= 0)) return [0, 0, 0];
  const inverses = rawPrices.map((value: number) => 1000 / value);
  const total = inverses.reduce((sum: number, value: number) => sum + value, 0);
  return inverses.map((value: number) => Number(((value / total) * 100).toFixed(3))) as [number, number, number];
}

export function normalizeOddsWindow(
  records: Array<Record<string, any>>,
  fixtureId: number,
  scoreMarks: ScoreMark[],
  windowTs: number,
): OddsTick | undefined {
  const candidates = records
    .filter((record) => Number(record.FixtureId ?? record.fixtureId) === fixtureId)
    .filter((record) => String(record.SuperOddsType ?? record.superOddsType) === "1X2_PARTICIPANT_RESULT")
    .filter((record) => !(record.MarketPeriod ?? record.marketPeriod))
    .sort((left, right) => Number(left.Ts ?? left.ts) - Number(right.Ts ?? right.ts));
  const selected = candidates[candidates.length - 1];
  if (!selected) return undefined;
  const ts = Number(selected.Ts ?? selected.ts ?? windowTs);
  const rawPrices = (selected.Prices ?? selected.prices ?? []).map(Number);
  const suspended = rawPrices.length !== 3 || rawPrices.some((value: number) => !Number.isFinite(value) || value <= 1);
  const latestScore = [...scoreMarks].reverse().find((mark) => mark.ts <= ts) || scoreMarks[0];
  return {
    fixtureId,
    messageId: String(selected.MessageId ?? selected.messageId),
    ts,
    inRunning: Boolean(selected.InRunning ?? selected.inRunning),
    suspended,
    prices: suspended ? [0, 0, 0] : rawPrices as [number, number, number],
    probabilities: suspended ? [0, 0, 0] : probabilities(selected),
    score: [latestScore?.homeScore ?? 0, latestScore?.awayScore ?? 0],
  };
}

export function attachScores(ticks: OddsTick[], scoreMarks: ScoreMark[]): OddsTick[] {
  return ticks.map((tick) => {
    const mark = [...scoreMarks].reverse().find((candidate) => candidate.ts <= tick.ts);
    return { ...tick, score: [mark?.homeScore ?? 0, mark?.awayScore ?? 0] };
  });
}
