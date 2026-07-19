# Confirmed Consensus Shock

## Thesis

In-play odds can move sharply after score events, but a single update can be noise, a stale bookmaker, or an incomplete market. VeriSignal trades only when a broad TxLINE 1X2 implied-probability shock is consistent with the score and persists into the next interval.

This is a transparent momentum-continuation hypothesis for demonstrating autonomous decision infrastructure. It is not a claim of guaranteed alpha.

## Inputs

For tick `t` and outcome `i`:

```text
p[t,i] = normalized implied probability in [0, 1]
shock[t,i] = p[t,i] - p[t-1,i]
```

If TxLINE supplies percentages, those are used. Otherwise decimal prices are inverted and normalized across home, draw, and away.

## Entry Rules

A candidate is armed when all conditions hold:

```text
max_i(shock[t,i]) >= 0.12
score_leader(t) == candidate_outcome
feed_gap <= 6 minutes
all three 1X2 prices are complete and unsuspended
current drawdown < 3%
```

The draw outcome is aligned only when the score is tied. The candidate enters on the next available interval only if:

```text
p[t+1,candidate] >= p[t,candidate] - 0.02
t[t+1] - t[t] <= 6 minutes
score_leader(t+1) == candidate
all risk gates still pass
```

This one-interval confirmation filters one-tick spikes and ensures the action remains contextual.

## Position Sizing

The agent converts the observed shock into a deliberately conservative projected probability:

```text
projected = min(0.98, market_p + max(0.02, shock * 0.18))
decimal_odds = 1 / market_p
net_odds = decimal_odds - 1
full_kelly = max(0, (net_odds * projected - (1 - projected)) / net_odds)
fraction = min(0.02, 0.25 * full_kelly)
stake = equity * fraction
```

Quarter-Kelly dampens model error; the 2% cap is absolute even if Kelly recommends more.

## Exit Rules

The position exits at the first condition:

- implied probability increases 15 percentage points from entry;
- implied probability decreases 8 percentage points from entry;
- four valid ticks have elapsed; or
- the replay window closes, in which case it is marked to the final quote.

A stale feed, suspended quote, incomplete market, or exhausted drawdown budget always creates a visible `HALT`. It never silently skips a failed gate.

## Actions

| Action | Meaning |
| --- | --- |
| `OBSERVE` | Valid tick but no executable signal |
| `ARM` | Threshold crossed; wait for persistence |
| `ENTER` | Confirmation, context, sizing, and all risk gates passed |
| `HOLD` | Position remains inside exit bands |
| `EXIT` | Take-profit, stop-loss, or maximum hold fired |
| `SETTLE` | Replay ended with an open paper position |
| `HALT` | Data-quality or portfolio-risk gate blocked operation |

## Reproducibility

`server/strategy.ts` has no network, clock, database, or random dependency. Given the same ticks and policy it emits byte-for-byte identical decision records and audit hashes. Unit tests cover the profitable path, contradictory score context, suspension, and repeated-run identity.

## Scope and Limitations

- The showcase operates on an official historical TxLINE window because World Cup matches may not be live while judges review.
- Paper P&L marks probability shares, not venue fills, fees, latency, or slippage.
- One fixture is evidence of a working decision system, not statistical validation of expected return.
- Production use requires backtesting across many fixtures, walk-forward evaluation, calibration, venue constraints, and independent risk review.
