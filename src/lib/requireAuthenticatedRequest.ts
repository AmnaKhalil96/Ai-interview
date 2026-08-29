import { NextResponse } from "next/server";
import { extractBearerToken, verifyIdToken, InvalidIdTokenError } from "@/lib/verifyIdToken";
import { checkRateLimit } from "@/lib/rateLimit";

// Shared gate for both Gemini-backed routes (generate-questions,
// evaluate-answer): verify the caller is a real signed-in Firebase user,
// then enforce that user's per-route rate limit. Both checks exist for
// the same underlying reason — this app is publicly deployed and its
// Gemini calls cost real quota/money, and the frontend redirecting
// signed-out visitors to /login is a UX nicety, not a security boundary.
// Anyone can call POST /api/generate-questions directly with curl,
// skipping the browser and the redirect entirely — the only thing that
// actually stops that is a check inside the route handler itself, which
// is what this function is. Without it, the rate limit below would be
// worthless too: an anonymous caller could just omit auth and get an
// unlimited number of free "anonymous" requests instead of hitting a
// per-user cap.
//
// Returns the verified uid on success, or a NextResponse the caller
// should return immediately (401 for missing/invalid auth, 429 for rate
// limit, 500 for server misconfiguration).
export async function requireAuthenticatedRequest(
  request: Request,
  routeKey: string,
  limit: number,
  windowMs: number
): Promise<{ uid: string } | NextResponse> {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "You must be signed in to do this. Please log in and try again." },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    uid = await verifyIdToken(token);
  } catch (error) {
    if (error instanceof InvalidIdTokenError) {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }
    // Anything else (e.g. missing NEXT_PUBLIC_FIREBASE_PROJECT_ID) is a
    // deployment misconfiguration, not something the caller did wrong.
    console.error(`[${routeKey}] ID token verification failed unexpectedly:`, error);
    return NextResponse.json(
      { error: "An unexpected error occurred while verifying your session." },
      { status: 500 }
    );
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`${routeKey}:${uid}`, limit, windowMs);
  if (!allowed) {
    return NextResponse.json(
      { error: "You've reached the practice limit for this hour. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  return { uid };
}
