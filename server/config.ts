export type TxlineNetwork = "devnet" | "mainnet";

const requestedNetwork = process.env.TXLINE_NETWORK;
export const network: TxlineNetwork = requestedNetwork === "mainnet" ? "mainnet" : "devnet";

const defaults = {
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: "https://api.devnet.solana.com",
    programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  },
  mainnet: {
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
  },
} as const;

export const txlineConfig = {
  network,
  apiOrigin: process.env.TXLINE_API_ORIGIN || defaults[network].apiOrigin,
  rpcUrl: process.env.SOLANA_RPC_URL || defaults[network].rpcUrl,
  programId: defaults[network].programId,
  apiToken: process.env.TXLINE_API_TOKEN,
  simulationPayer: process.env.SOLANA_SIMULATION_PAYER
    || "GjKQpbBMw6nbJGeDJeoygtQBS4hC6J7Lzp96aFNg8CEq",
};

export const hasLiveCredentials = Boolean(txlineConfig.apiToken);
