import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  CirclePause,
  Database,
  ExternalLink,
  FileCheck2,
  Gauge,
  Play,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  TimerReset,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentRun, DecisionRecord, OddsTick, Outcome } from "../shared/types";

function compact(value: string | undefined, lead = 8, tail = 6) {
  if (!value) return "Not available";
  return value.length > lead + tail + 3 ? `${value.slice(0, lead)}...${value.slice(-tail)}` : value;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function time(value: number) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(value);
}

function sideName(side: Outcome | undefined, run: AgentRun) {
  if (!side) return "No position";
  if (side === "draw") return "Draw";
  return side === "participant-1" ? run.fixture.participant1 : run.fixture.participant2;
}

function actionTone(action: DecisionRecord["action"]) {
  if (action === "enter" || action === "exit" || action === "settle") return "positive";
  if (action === "halt") return "negative";
  if (action === "arm") return "warning";
  return "neutral";
}

function ProbabilityChart({ run, cursor }: { run: AgentRun; cursor: number }) {
  const width = 920;
  const height = 290;
  const inset = { top: 22, right: 18, bottom: 34, left: 42 };
  const innerWidth = width - inset.left - inset.right;
  const innerHeight = height - inset.top - inset.bottom;
  const point = (tick: OddsTick, index: number, series: number) => ({
    x: inset.left + (index / Math.max(1, run.timeline.length - 1)) * innerWidth,
    y: inset.top + (1 - tick.probabilities[series] / 100) * innerHeight,
  });
  const paths = [0, 1, 2].map((series) => run.timeline
    .map((tick, index) => point(tick, index, series))
    .map((item, index) => `${index ? "L" : "M"}${item.x.toFixed(1)},${item.y.toFixed(1)}`)
    .join(" "));
  const cursorX = inset.left + (Math.min(cursor, run.timeline.length - 1) / Math.max(1, run.timeline.length - 1)) * innerWidth;
  const scoreChanges = run.timeline.map((tick, index) => ({ tick, index })).filter(({ tick, index }) => {
    const previous = run.timeline[index - 1];
    return previous && (tick.score[0] !== previous.score[0] || tick.score[1] !== previous.score[1]);
  });

  return (
    <div className="chart-wrap" aria-label="TxLINE implied probability chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="France, draw, and England implied probability over time">
        {[0, 25, 50, 75, 100].map((value) => {
          const y = inset.top + (1 - value / 100) * innerHeight;
          return (
            <g key={value}>
              <line className="grid-line" x1={inset.left} x2={width - inset.right} y1={y} y2={y} />
              <text className="axis-label" x={inset.left - 9} y={y + 4} textAnchor="end">{value}%</text>
            </g>
          );
        })}
        {scoreChanges.map(({ tick, index }) => {
          const x = point(tick, index, 0).x;
          return (
            <g key={`${tick.ts}-${index}`}>
              <line className="goal-line" x1={x} x2={x} y1={inset.top} y2={height - inset.bottom} />
              <circle className="goal-dot" cx={x} cy={inset.top + 8} r="4" />
            </g>
          );
        })}
        <path className="series home" d={paths[0]} />
        <path className="series draw" d={paths[1]} />
        <path className="series away" d={paths[2]} />
        <line className="cursor-line" x1={cursorX} x2={cursorX} y1={inset.top} y2={height - inset.bottom} />
        <text className="axis-label" x={inset.left} y={height - 9}>{time(run.timeline[0].ts)}</text>
        <text className="axis-label" x={width - inset.right} y={height - 9} textAnchor="end">{time(run.timeline.at(-1)!.ts)}</text>
      </svg>
    </div>
  );
}

function App() {
  const [run, setRun] = useState<AgentRun>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [selectedSequence, setSelectedSequence] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setCursor(0);
    setPlaying(true);
    try {
      const response = await fetch("/api/agent?action=run");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Agent run failed");
      setRun(body as AgentRun);
      setSelectedSequence(1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent run failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!run || !playing || cursor >= run.decisions.length - 1) return;
    const timer = window.setTimeout(() => {
      setCursor((current) => current + 1);
      setSelectedSequence((current) => Math.max(current, Math.min(cursor + 2, run.decisions.length)));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [cursor, playing, run]);

  const visibleDecisions = useMemo(() => run?.decisions.slice(0, cursor + 1) || [], [cursor, run]);
  const selected = run?.decisions.find((decision) => decision.sequence === selectedSequence)
    || visibleDecisions.at(-1);
  const activeTick = run?.timeline[Math.min(cursor, (run?.timeline.length || 1) - 1)];
  const automated = Boolean(run && cursor >= run.decisions.length - 1);

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="brand-mark"><Activity size={20} /></span>
        <div><b>VeriSignal</b><span>Loading TxLINE execution tape...</span></div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="error-screen">
        <TriangleAlert size={30} />
        <h1>Agent feed unavailable</h1>
        <p>{error || "No run was returned."}</p>
        <button onClick={() => void load()}><RefreshCw size={17} /> Retry</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Activity size={18} /></span><b>VeriSignal</b><span>Autonomous strategy desk</span></div>
        <div className="topbar-status">
          <span className={`source-pill ${run.mode === "txline-replay" ? "verified" : "reference"}`}>
            <span className="pulse-dot" /> {run.mode === "txline-replay" ? "TXLINE CONNECTED" : "REFERENCE SIMULATION"}
          </span>
          <span className="network-pill">{run.source.network}</span>
          <a href="https://txline.txodds.com/documentation/worldcup" target="_blank" rel="noreferrer" title="TxLINE documentation"><ExternalLink size={16} /></a>
        </div>
      </header>

      <section className="runbar">
        <div className="fixture-identity">
          <span className="eyebrow">WORLD CUP / 1X2 CONSENSUS</span>
          <h1>{run.fixture.participant1} <span>vs</span> {run.fixture.participant2}</h1>
        </div>
        <div className="score-lockup">
          <span>{activeTick?.score[0] ?? 0}</span><small>:</small><span>{activeTick?.score[1] ?? 0}</span>
          <b>{activeTick?.inRunning ? "IN-PLAY" : "PRE-MATCH"}</b>
        </div>
        <div className="agent-state">
          <span className={`state-icon ${automated ? "complete" : "running"}`}>{automated ? <Check size={18} /> : <Bot size={18} />}</span>
          <div><b>{automated ? "RUN COMPLETE" : "AGENT EXECUTING"}</b><span>{compact(run.runId, 12, 5)}</span></div>
        </div>
        <div className="replay-controls">
          <button onClick={() => setPlaying((value) => !value)} title={playing ? "Pause replay" : "Resume replay"} aria-label={playing ? "Pause replay" : "Resume replay"}>
            {playing ? <CirclePause size={18} /> : <Play size={18} />}
          </button>
          <button onClick={() => { setCursor(0); setSelectedSequence(1); setPlaying(true); }} title="Restart replay" aria-label="Restart replay"><TimerReset size={18} /></button>
        </div>
      </section>

      <section className="metric-strip">
        <div><span>REALIZED P&amp;L</span><b className={run.metrics.realisedPnl >= 0 ? "gain" : "loss"}>{run.metrics.realisedPnl >= 0 ? "+" : ""}{money(run.metrics.realisedPnl)}</b></div>
        <div><span>RETURN</span><b>{run.metrics.returnPct.toFixed(2)}%</b></div>
        <div><span>TRADES</span><b>{run.metrics.trades}</b></div>
        <div><span>MAX DRAWDOWN</span><b>{run.metrics.maxDrawdownPct.toFixed(2)}%</b></div>
        <div><span>RECORDS READ</span><b>{run.source.recordsRead.toLocaleString()}</b></div>
        <div><span>PROOF</span><b className={run.proof.status === "passed" ? "gain" : run.proof.status === "failed" ? "loss" : "muted"}>{run.proof.status.toUpperCase()}</b></div>
      </section>

      <main className="desk-grid">
        <aside className="policy-panel">
          <div className="panel-heading"><div><span className="eyebrow">POLICY V1.0</span><h2>Execution rules</h2></div><ShieldCheck size={20} /></div>
          <div className="strategy-name"><TrendingUp size={18} /><div><b>Confirmed Consensus Shock</b><span>Deterministic momentum continuation</span></div></div>
          <dl className="policy-list">
            <div><dt>Shock threshold</dt><dd>{Math.round(run.policy.shockThreshold * 100)} pp</dd></div>
            <div><dt>Confirmation</dt><dd>1 interval</dd></div>
            <div><dt>Position cap</dt><dd>{Math.round(run.policy.maxPositionPct * 100)}%</dd></div>
            <div><dt>Kelly fraction</dt><dd>0.25x</dd></div>
            <div><dt>Take profit</dt><dd>+{Math.round(run.policy.takeProfitProbability * 100)} pp</dd></div>
            <div><dt>Stop loss</dt><dd>-{Math.round(run.policy.stopLossProbability * 100)} pp</dd></div>
            <div><dt>Drawdown kill</dt><dd>{Math.round(run.policy.maxDrawdownPct * 100)}%</dd></div>
          </dl>
          <div className="guardrail-list">
            <h3>Pre-execution gates</h3>
            {["Feed freshness", "Market completeness", "Score alignment", "Drawdown budget"].map((label) => (
              <div key={label}><Check size={14} /><span>{label}</span><b>ENFORCED</b></div>
            ))}
          </div>
          <div className="source-block">
            <h3><Database size={15} /> TxLINE inputs</h3>
            <code>{run.source.oddsEndpoint}</code>
            <code>{run.source.scoresEndpoint}</code>
          </div>
        </aside>

        <section className="market-panel">
          <div className="panel-heading chart-heading">
            <div><span className="eyebrow">DERIVED FROM TXLINE STABLEPRICE</span><h2>Implied probability</h2></div>
            <div className="legend">
              <span className="home"><i />{run.fixture.participant1}</span>
              <span className="draw"><i />Draw</span>
              <span className="away"><i />{run.fixture.participant2}</span>
              <span className="goals"><i />Goal</span>
            </div>
          </div>
          <ProbabilityChart run={run} cursor={cursor} />
          <div className="execution-tape">
            <div className="tape-header"><div><SquareTerminal size={15} /> Agent decision tape</div><span>{visibleDecisions.length}/{run.decisions.length} actions</span></div>
            <div className="decision-table" role="table" aria-label="Agent decision tape">
              <div className="decision-row table-labels" role="row"><span>TIME</span><span>ACTION</span><span>SIDE</span><span>PROB.</span><span>EQUITY</span><span>HASH</span></div>
              {visibleDecisions.slice(-8).map((decision) => (
                <button
                  className={`decision-row ${selected?.sequence === decision.sequence ? "selected" : ""}`}
                  key={decision.sequence}
                  onClick={() => setSelectedSequence(decision.sequence)}
                  role="row"
                >
                  <span className="mono">{time(decision.ts)}</span>
                  <span><b className={`action-tag ${actionTone(decision.action)}`}>{decision.action.toUpperCase()}</b></span>
                  <span>{sideName(decision.side, run)}</span>
                  <span className="mono">{(decision.probability * 100).toFixed(1)}%</span>
                  <span className="mono">{money(decision.equity)}</span>
                  <span className="mono hash-cell">{compact(decision.decisionHash, 6, 4)} <ChevronRight size={13} /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="audit-panel">
          <div className="panel-heading"><div><span className="eyebrow">PROOF-CARRYING ACTION</span><h2>Decision receipt</h2></div><FileCheck2 size={20} /></div>
          {selected ? (
            <>
              <div className={`receipt-action ${actionTone(selected.action)}`}><span>{selected.action.toUpperCase()}</span><b>#{String(selected.sequence).padStart(3, "0")}</b></div>
              <div className="receipt-primary"><span>Instrument</span><b>{sideName(selected.side, run)}</b><small>{(selected.probability * 100).toFixed(3)}% implied probability</small></div>
              <dl className="receipt-data">
                <div><dt>Feed time</dt><dd>{time(selected.ts)}</dd></div>
                <div><dt>Score context</dt><dd>{selected.score[0]}–{selected.score[1]}</dd></div>
                <div><dt>Probability shock</dt><dd>{selected.shock >= 0 ? "+" : ""}{(selected.shock * 100).toFixed(2)} pp</dd></div>
                <div><dt>Stake</dt><dd>{selected.stake ? money(selected.stake) : "—"}</dd></div>
                <div><dt>Marked P&amp;L</dt><dd>{selected.pnl === undefined ? "—" : `${selected.pnl >= 0 ? "+" : ""}${money(selected.pnl)}`}</dd></div>
              </dl>
              <div className="reason-block"><span>DETERMINISTIC REASON</span><p>{selected.reason}</p></div>
              <div className="check-block">
                <span>POLICY CHECKS</span>
                {selected.checks.map((check) => <div key={check.label} className={check.passed ? "passed" : "failed"}>{check.passed ? <Check size={14} /> : <TriangleAlert size={14} />}<b>{check.label}</b><small>{check.passed ? "PASS" : "FAIL"}</small></div>)}
              </div>
              <div className="hash-block"><span>TXLINE MESSAGE</span><code>{selected.messageId}</code><span>PREVIOUS HASH</span><code>{selected.previousHash}</code><span>DECISION HASH</span><code>{selected.decisionHash}</code></div>
            </>
          ) : null}
          <div className={`proof-block ${run.proof.status}`}>
            <div><Gauge size={17} /><b>SOLANA ODDS PROOF</b><span>{run.proof.status.toUpperCase()}</span></div>
            <dl>
              <div><dt>Program</dt><dd>{compact(run.proof.programId)}</dd></div>
              <div><dt>Root PDA</dt><dd>{compact(run.proof.rootAccount)}</dd></div>
              <div><dt>Proof depth</dt><dd>{run.proof.proofDepth ?? "—"}</dd></div>
              <div><dt>Compute units</dt><dd>{run.proof.unitsConsumed?.toLocaleString() ?? "—"}</dd></div>
            </dl>
            {run.proof.rootAccount ? <a href={`https://explorer.solana.com/address/${run.proof.rootAccount}?cluster=devnet`} target="_blank" rel="noreferrer">Inspect root account <ExternalLink size={13} /></a> : null}
          </div>
        </aside>
      </main>

      <footer><span>{run.disclaimer}</span><span>Audit head <code>{compact(run.auditHead, 12, 8)}</code></span></footer>
    </div>
  );
}

export default App;
