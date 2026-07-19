import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasLiveCredentials, txlineConfig } from "../server/config.js";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  return response.status(200).json({
    ok: true,
    service: "verisignal-agent",
    autonomous: true,
    txlineConfigured: hasLiveCredentials,
    network: txlineConfig.network,
    programId: txlineConfig.programId,
  });
}
