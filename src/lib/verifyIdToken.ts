// Server-side verification of a Firebase Auth ID token, for use inside API
// routes only (never imported by client components — see the "why verify
// at all" note in each route.ts).
//
// This deliberately does NOT use the firebase-admin SDK. Admin SDK
// verification (admin.auth().verifyIdToken()) needs a service-account
// credential wired up as a secret, which this project doesn't have set up
// (only the public client web-app config in .env.local). Firebase's own
// docs describe exactly this alternative — verifying the ID token as a
// plain JWT against Google's published public keys — for environments
// that can't or don't want to hold a service-account key:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
//
// Trade-off: this checks signature, issuer, audience, expiry, and subject
// exactly like the Admin SDK does, but skips the one thing that requires
// a live Admin SDK call — checking whether the token's user/session was
// explicitly revoked (e.g. a password reset) before it naturally expired.
// Tokens are short-lived (~1 hour), so a revoked token stays usable for at
// most that long here. Acceptable for gating Gemini-quota abuse; would be
// worth revisiting with the Admin SDK if this route ever needed to enforce
// revocation immediately (e.g. a "sign out everywhere" security feature).
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  JWTExpired,
  JWTClaimValidationFailed,
  JWTInvalid,
  JWSSignatureVerificationFailed,
  JWSInvalid,
} from "jose/errors";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Google's published JWKS for the token-signing service account behind
// Firebase Auth. createRemoteJWKSet caches the keys in memory and only
// re-fetches when it sees a `kid` it doesn't recognize (e.g. after Google
// rotates them) or its own cache TTL elapses — so this doesn't mean a
// network round-trip on every request.
// timeoutDuration is bumped from jose's 5s default — observed the *first*
// fetch of this JWKS (cold cache, cold TLS handshake) take noticeably
// longer than 5s in testing, which would otherwise misclassify a slow-but-
// legitimate key fetch as an invalid token (401) instead of retrying or
// erroring honestly. Subsequent requests hit jose's in-memory cache and
// don't pay this cost again.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
  { timeoutDuration: 15_000 }
);

export class InvalidIdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdTokenError";
  }
}

// Returns the verified user's uid, or throws InvalidIdTokenError.
export async function verifyIdToken(idToken: string): Promise<string> {
  if (!projectId) {
    // A misconfigured deployment (missing env var), not a bad request —
    // callers should treat this as a 500, not a 401. See route.ts.
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured.");
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    // Firebase ID tokens always carry `sub` (and mirror it as `user_id`)
    // as the signed-in user's uid — this is what request.auth.uid
    // resolves to everywhere else in the app (Firestore rules, useAuth()).
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new InvalidIdTokenError("Token is missing a subject claim.");
    }

    return payload.sub;
  } catch (error) {
    if (error instanceof InvalidIdTokenError) throw error;

    // Only errors that mean "this specific token is genuinely bad" become
    // a 401. Everything else — most importantly a JWKS fetch failure
    // (JWKSTimeout, JWKSNoMatchingKey, a network blip reaching Google) —
    // is OUR server failing to complete verification, not proof the
    // token is invalid. Rethrowing those as-is lets them fall through to
    // requireAuthenticatedRequest's generic catch, which returns a 500
    // and (unlike this 401 path) logs the failure — misclassifying an
    // infra hiccup as "your session expired" would both mislead the user
    // and hide the real problem from server logs.
    if (
      error instanceof JWTExpired ||
      error instanceof JWTClaimValidationFailed ||
      error instanceof JWTInvalid ||
      error instanceof JWSSignatureVerificationFailed ||
      error instanceof JWSInvalid
    ) {
      throw new InvalidIdTokenError(error.message);
    }
    throw error;
  }
}

// Pulls the ID token out of a standard `Authorization: Bearer <token>`
// header, or returns null if it's missing/malformed — callers turn that
// into a 401 without needing to know the header format themselves.
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}
