import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { createRequire } from "node:module";
import type { ChainProof } from "../shared/types.js";
import { sha256 } from "./hash.js";
import { txlineConfig } from "./config.js";

const require = createRequire(import.meta.url);
const txoracleIdl = require("./idl/txoracle.json") as anchor.Idl;

interface ProofNode { hash: number[] | string; isRightSibling: boolean }
interface OddsProofPayload {
  odds: Record<string, any>;
  summary: Record<string, any>;
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}

function bytes32(value: number[] | string): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value)
    : value.startsWith("0x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error(`Expected 32 bytes, received ${bytes.length}`);
  return Array.from(bytes);
}

function proof(nodes: ProofNode[] | undefined) {
  return (nodes || []).map((node) => ({ hash: bytes32(node.hash), isRightSibling: node.isRightSibling }));
}

export async function verifyOddsOnChain(payload: OddsProofPayload): Promise<ChainProof> {
  const messageId = String(payload.odds.MessageId ?? payload.odds.messageId);
  const base = { programId: txlineConfig.programId, messageId, payloadHash: sha256(payload) };
  try {
    if (txlineConfig.network !== "devnet") throw new Error("Bundled IDL targets TxLINE devnet");
    const connection = new Connection(txlineConfig.rpcUrl, "confirmed");
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), { commitment: "confirmed" });
    const program = new Program(txoracleIdl, provider);
    if (program.programId.toBase58() !== txlineConfig.programId) throw new Error("TxLINE IDL/program mismatch");

    const oddsRaw = payload.odds;
    const timestamp = Number(oddsRaw.Ts ?? oddsRaw.ts);
    const odds = {
      fixtureId: new BN(oddsRaw.FixtureId ?? oddsRaw.fixtureId),
      messageId,
      ts: new BN(timestamp),
      bookmaker: String(oddsRaw.Bookmaker ?? oddsRaw.bookmaker),
      bookmakerId: Number(oddsRaw.BookmakerId ?? oddsRaw.bookmakerId),
      superOddsType: String(oddsRaw.SuperOddsType ?? oddsRaw.superOddsType),
      gameState: oddsRaw.GameState ?? oddsRaw.gameState ?? null,
      inRunning: Boolean(oddsRaw.InRunning ?? oddsRaw.inRunning),
      marketParameters: oddsRaw.MarketParameters ?? oddsRaw.marketParameters ?? null,
      marketPeriod: oddsRaw.MarketPeriod ?? oddsRaw.marketPeriod ?? null,
      priceNames: oddsRaw.PriceNames ?? oddsRaw.priceNames ?? [],
      prices: (oddsRaw.Prices ?? oddsRaw.prices ?? []).map(Number),
    };
    const summaryRaw = payload.summary;
    const summary = {
      fixtureId: new BN(summaryRaw.fixtureId ?? summaryRaw.FixtureId),
      updateStats: {
        updateCount: Number(summaryRaw.updateStats.updateCount),
        minTimestamp: new BN(summaryRaw.updateStats.minTimestamp),
        maxTimestamp: new BN(summaryRaw.updateStats.maxTimestamp),
      },
      oddsSubTreeRoot: bytes32(summaryRaw.oddsSubTreeRoot),
    };
    const epochDay = Math.floor(timestamp / 86_400_000);
    const epochBuffer = new BN(epochDay).toArrayLike(Buffer, "le", 2);
    const [rootAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("daily_batch_roots"), epochBuffer],
      program.programId,
    );
    const builder = program.methods
      .validateOdds(new BN(timestamp), odds, summary, proof(payload.subTreeProof), proof(payload.mainTreeProof))
      .accounts({ dailyOddsMerkleRoots: rootAccount })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })]);
    const transaction = await builder.transaction();
    const message = new TransactionMessage({
      payerKey: new PublicKey(txlineConfig.simulationPayer),
      recentBlockhash: (await connection.getLatestBlockhash("confirmed")).blockhash,
      instructions: transaction.instructions,
    }).compileToV0Message();
    const simulation = await connection.simulateTransaction(new VersionedTransaction(message), { sigVerify: false });
    if (simulation.value.err) throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    const prefix = `Program return: ${program.programId.toBase58()} `;
    const returnLog = (simulation.value.logs || []).find((line) => line.startsWith(prefix));
    const passed = returnLog ? Buffer.from(returnLog.slice(prefix.length), "base64")[0] === 1 : false;
    return {
      ...base,
      status: passed ? "passed" : "failed",
      rootAccount: rootAccount.toBase58(),
      unitsConsumed: simulation.value.unitsConsumed ?? undefined,
      proofDepth: (payload.subTreeProof?.length || 0) + (payload.mainTreeProof?.length || 0),
    };
  } catch {
    return { ...base, status: "failed" };
  }
}
