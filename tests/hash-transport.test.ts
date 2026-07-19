import { describe, expect, it } from "vitest";
import { sha256 } from "../server/hash";

describe("transport-safe canonical hashes", () => {
  it("matches the JSON-transported representation when optional fields are undefined", () => {
    const action = { sequence: 1, action: "observe", stake: undefined, pnl: undefined };
    const transported = JSON.parse(JSON.stringify(action));
    expect(sha256(action)).toBe(sha256(transported));
  });
});
