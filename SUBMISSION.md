# TxODDS World Cup Hackathon Submission

## Track

Trading Tools and Agents

## Project Title

VeriSignal

## Link to Submission

https://verisignal-agent.vercel.app

## Live Working MVP

https://verisignal-agent.vercel.app

## Public Repository

https://github.com/FeeeeelixWong/verisignal-agent

## Technical Documentation

https://github.com/FeeeeelixWong/verisignal-agent/blob/main/ARCHITECTURE.md

## Briefly Explain Your Project

VeriSignal is a proof-carrying autonomous strategy agent for professional sports-market and risk teams. It ingests official TxLINE 1X2 odds and score updates, detects a score-aligned probability shock, confirms persistence, sizes a bounded quarter-Kelly paper position, and exits or halts without human intervention. Every action includes explicit risk checks, its TxLINE message ID, and a hash-linked receipt. The entry record is also verified by simulating TxLINE's official `validateOdds` instruction on Solana devnet. The live MVP requires no wallet, account, token, or fee.

## TxLINE Experience and Feedback

What worked especially well was the separation between efficient off-chain feed delivery and cryptographic validation. The historical five-minute update windows made a deterministic judge replay possible even after a match ended, while the validation endpoint supplied the exact Merkle material needed to verify the agent's entry record with the Solana program. That combination let us build a product that is both responsive and auditable.

The main friction was joining score events to odds updates. The historical scores endpoint is an SSE-style event log with several action shapes, while odds windows contain multiple market types and bookmaker records. A documented canonical event schema, cursor-based historical replay endpoint, and official TypeScript normalization helpers would reduce integration time. A batch proof endpoint would also help professional agents validate several decision inputs without one request per message.

## Anything Else

- Judge fast path: https://github.com/FeeeeelixWong/verisignal-agent#judge-fast-path
- Deterministic strategy specification: https://github.com/FeeeeelixWong/verisignal-agent/blob/main/STRATEGY.md
- Online smoke: `BASE_URL=https://verisignal-agent.vercel.app npm run smoke:online`
- The public repository contains no raw TxLINE dataset and no API credentials.
- Paper-execution only: no custody, wagering, or live-capital deployment.
