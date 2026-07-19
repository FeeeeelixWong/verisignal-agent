import { describe, expect, it } from "vitest";
import { sha256 } from "../server/hash";

describe("canonical decision hashing", () => {
  it("is independent of object key order", () => {
    expect(sha256({ b: 2, a: 1 })).toBe(sha256({ a: 1, b: 2 }));
  });
});
