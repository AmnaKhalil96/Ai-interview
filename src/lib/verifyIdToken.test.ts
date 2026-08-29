import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./verifyIdToken";

// jwtVerify itself (the network-dependent half of this module) is
// exercised by the manual live testing described in the PR/commit this
// change shipped with (real sign-in -> real ID token -> real route call),
// not here — mocking Google's JWKS endpoint would only prove the mock
// behaves as configured, not that verification actually works against a
// real Firebase-issued token. extractBearerToken is pure header parsing
// with no network dependency, so it's covered directly.
function requestWithHeader(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://example.com", { headers });
}

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken(requestWithHeader("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("returns null when the header is missing", () => {
    expect(extractBearerToken(requestWithHeader(null))).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearerToken(requestWithHeader("Basic abc123"))).toBeNull();
  });

  it("returns null when the header has no token", () => {
    expect(extractBearerToken(requestWithHeader("Bearer"))).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(extractBearerToken(requestWithHeader(""))).toBeNull();
  });
});
