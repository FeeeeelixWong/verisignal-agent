# VeriSignal Demo Script

The judged demo is generated from the deployed product with synchronized narration and captions:

```bash
DEMO_APP_URL=https://verisignal-agent.vercel.app npm run demo:record
```

Each sentence is synthesized as a separate audio segment. Its measured duration drives the matching browser scene, and the same segment boundaries generate the SRT file. Burned-in captions therefore use the exact spoken text and timing.

Default voice: `en-US-AndrewMultilingualNeural`, slightly slowed for a natural technical presentation.

Outputs:

- `docs/media/verisignal-demo.mp4`
- `docs/media/verisignal-demo.srt`

## Storyboard

| Time | Visual | Judge criterion |
| --- | --- | --- |
| 0:00-0:08 | Hook: why did the agent act? | Novelty and auditability |
| 0:08-0:36 | Real product, official historical TxLINE replay, 42,564 records | Core functionality and data ingestion |
| 0:36-0:54 | Full autonomous replay | Autonomous operation |
| 0:54-1:30 | `ENTER #011`, explicit gates, message ID, hash chain | Logic and code architecture |
| 1:30-1:50 | Official Solana `validateOdds` proof passes | Cryptographic source evidence |
| 1:50-2:06 | `EXIT #014`, +66.38 realized paper P&L | Defined strategy and user value |
| 2:06-2:22 | `HALT #031` on market completeness failure | Production risk controls |
| 2:22-2:41 | Deterministic state machine and execution boundary | Production readiness |
| 2:41-2:53 | Close and live URL | Clear project recall |

## Claims Discipline

- The replay uses official historical TxLINE data fetched at runtime; it is not described as a currently live match.
- The result is paper execution and reference P&L, not a real wager, fill, or expected-return claim.
- Solana validation is a read-only simulation of the official TxLINE instruction, not an on-chain settlement transaction.
- VeriSignal does not custody funds or require a judge wallet.
