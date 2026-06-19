import { describe, expect, it } from "vitest";
import { TokenBucket } from "./throttle.js";

describe("TokenBucket", () => {
  it("limits to the configured rate using virtual time", async () => {
    // Virtual clock: sleep advances time, now() reads it — no real waiting.
    let nowMs = 0;
    const sleep = (ms: number): Promise<void> => {
      nowMs += ms;
      return Promise.resolve();
    };
    const now = () => nowMs;

    // Capacity 2, 60/min refill (= 1 token/sec).
    const bucket = new TokenBucket(2, 60, sleep, now);

    // First two are immediate (burst capacity), no time advances.
    await bucket.acquire();
    await bucket.acquire();
    expect(nowMs).toBe(0);

    // Third must wait ~1s for a refill at 60/min.
    await bucket.acquire();
    expect(nowMs).toBeGreaterThanOrEqual(1000);
    expect(nowMs).toBeLessThan(1100);
  });
});
