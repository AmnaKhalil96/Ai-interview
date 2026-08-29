// verifyIdToken's actual jwtVerify call is exercised by live testing (see
// verifyIdToken.test.ts), so it's mocked here — this suite is about the
// gate's own branching (missing header -> 401, bad token -> 401, over
// limit -> 429, success -> uid), not JWT verification itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockVerifyIdToken = vi.fn();

vi.mock("@/lib/verifyIdToken", async () => {
  const actual = await vi.importActual<typeof import("./verifyIdToken")>("./verifyIdToken");
  return {
    ...actual,
    verifyIdToken: (token: string) => mockVerifyIdToken(token),
  };
});

import { requireAuthenticatedRequest } from "./requireAuthenticatedRequest";
import { __resetRateLimitsForTests } from "./rateLimit";
import { InvalidIdTokenError } from "./verifyIdToken";

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://example.com/api/test", { headers });
}

beforeEach(() => {
  mockVerifyIdToken.mockReset();
  __resetRateLimitsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireAuthenticatedRequest", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const result = await requireAuthenticatedRequest(requestWithAuth(null), "test-route", 5, 60_000);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 401 when the token fails verification", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new InvalidIdTokenError("bad signature"));
    const result = await requireAuthenticatedRequest(
      requestWithAuth("Bearer bad-token"),
      "test-route",
      5,
      60_000
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 500 when verification fails for an unexpected (non-token) reason", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error("misconfigured project id"));
    const result = await requireAuthenticatedRequest(
      requestWithAuth("Bearer some-token"),
      "test-route",
      5,
      60_000
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(500);
  });

  it("returns the uid on a valid token within the rate limit", async () => {
    mockVerifyIdToken.mockResolvedValueOnce("uid-123");
    const result = await requireAuthenticatedRequest(
      requestWithAuth("Bearer good-token"),
      "test-route",
      5,
      60_000
    );
    expect(result).toEqual({ uid: "uid-123" });
  });

  it("returns 429 once the same uid exceeds the limit for that route", async () => {
    mockVerifyIdToken.mockResolvedValue("uid-456");

    for (let i = 0; i < 2; i++) {
      const ok = await requireAuthenticatedRequest(
        requestWithAuth("Bearer good-token"),
        "test-route",
        2,
        60_000
      );
      expect(ok).toEqual({ uid: "uid-456" });
    }

    const blocked = await requireAuthenticatedRequest(
      requestWithAuth("Bearer good-token"),
      "test-route",
      2,
      60_000
    );
    expect(blocked).toBeInstanceOf(NextResponse);
    expect((blocked as NextResponse).status).toBe(429);
    const body = await (blocked as NextResponse).json();
    expect(body.error).toMatch(/practice limit for this hour/i);
  });

  it("keeps rate limits separate per route key for the same uid", async () => {
    mockVerifyIdToken.mockResolvedValue("uid-789");

    const routeA1 = await requireAuthenticatedRequest(requestWithAuth("Bearer t"), "route-a", 1, 60_000);
    const routeA2 = await requireAuthenticatedRequest(requestWithAuth("Bearer t"), "route-a", 1, 60_000);
    const routeB1 = await requireAuthenticatedRequest(requestWithAuth("Bearer t"), "route-b", 1, 60_000);

    expect(routeA1).toEqual({ uid: "uid-789" });
    expect((routeA2 as NextResponse).status).toBe(429);
    expect(routeB1).toEqual({ uid: "uid-789" });
  });
});
