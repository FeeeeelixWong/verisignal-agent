import { hasLiveCredentials, txlineConfig } from "./config.js";

let cachedJwt: { token: string; expiresAt: number } | undefined;

async function checkedText(response: Response): Promise<string> {
  const text = await response.text();
  if (!response.ok) throw new Error(`TxLINE ${response.status}: ${text.slice(0, 280)}`);
  return text;
}

export async function getGuestJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token;
  const response = await fetch(`${txlineConfig.apiOrigin}/auth/guest/start`, { method: "POST" });
  const body = JSON.parse(await checkedText(response)) as { token: string };
  cachedJwt = { token: body.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return body.token;
}

export async function txlineText(path: string): Promise<string> {
  if (!hasLiveCredentials || !txlineConfig.apiToken) throw new Error("TXLINE_API_TOKEN is not configured");
  const jwt = await getGuestJwt();
  const response = await fetch(`${txlineConfig.apiOrigin}/api${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": txlineConfig.apiToken,
      Accept: "application/json, text/event-stream",
    },
  });
  return checkedText(response);
}

export async function txlineGet<T>(path: string): Promise<T> {
  return JSON.parse(await txlineText(path)) as T;
}
