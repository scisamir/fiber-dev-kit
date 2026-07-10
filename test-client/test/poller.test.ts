import { describe, expect, it } from "vitest";
import { pollUntilResolved } from "../src/poller";

describe("pollUntilResolved", () => {
  it("resolves once the predicate is satisfied", async () => {
    let calls = 0;
    const result = await pollUntilResolved(
      async () => {
        calls += 1;
        return calls;
      },
      (value) => value >= 3,
      { intervalMs: 5, timeoutMs: 1000 },
    );
    expect(result).toBe(3);
    expect(calls).toBe(3);
  });

  it("throws once timeoutMs elapses without the predicate resolving", async () => {
    await expect(
      pollUntilResolved(async () => false, (value) => value === true, { intervalMs: 5, timeoutMs: 30 }),
    ).rejects.toThrow(/not met/i);
  });
});
