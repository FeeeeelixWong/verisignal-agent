import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAgent } from "../server/agent-service.js";

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  try {
    return response.status(200).json(await runAgent());
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : "Agent run failed" });
  }
}
