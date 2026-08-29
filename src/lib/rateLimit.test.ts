import { describe, expect, it, beforeEach, vi } from "vitest";
import { checkRateLimit, __resetRateLimitsForTests } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
    vi.useRealTimers();
  });

  it("allows requests up to the limit, then blocks the next one", () => {
    const key = "route:uid-1";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", () => {
    expect(checkRateLimit("route:uid-a", 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit("route:uid-a", 1, 60_000).allowed).toBe(false);
    // A different key (different uid, or different route) is unaffected.
    expect(checkRateLimit("route:uid-b", 1, 60_000).allowed).toBe(true);
  });

  it("resets the count once the window elapses", () => {
    vi.useFakeTimers();
    const key = "route:uid-2";
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true);
    vi.useRealTimers();
  });
});
