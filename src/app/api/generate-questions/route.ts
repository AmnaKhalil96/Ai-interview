import { NextResponse } from "next/server";
import { generateQuestions, AIGenerationError } from "@/lib/ai/generateQuestions";
import { isDifficulty } from "@/lib/difficulty";
import { requireAuthenticatedRequest } from "@/lib/requireAuthenticatedRequest";

// Kept in sync with the textarea's own limit on the landing page — this is
// the server-side backstop so the route never trusts the client alone.
const MAX_JOB_DESCRIPTION_LENGTH = 3000;

// Question generation is naturally a once-per-session action (one call
// kicks off 5 questions), so a lower hourly ceiling than evaluate-answer
// (see that route) still comfortably covers many practice sessions per
// hour while capping how much Gemini quota one signed-in user can burn.
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Vercel Hobby plan caps any single function at 60s; Gemini's own
// generateContent call already times out at 20s (see
// lib/ai/generateQuestions.ts). 30s leaves headroom above that timeout
// plus ID-token verification and request parsing, well under the
// platform ceiling.
export const maxDuration = 30;

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedRequest(
    request,
    "generate-questions",
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { jobDescription, difficulty } = (body ?? {}) as {
    jobDescription?: unknown;
    difficulty?: unknown;
  };

  if (typeof jobDescription !== "string" || jobDescription.trim().length === 0) {
    return NextResponse.json(
      { error: "jobDescription is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `jobDescription must be ${MAX_JOB_DESCRIPTION_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  if (!isDifficulty(difficulty)) {
    return NextResponse.json(
      { error: 'difficulty is required and must be "entry", "mid", or "senior".' },
      { status: 400 }
    );
  }

  try {
    const questions = await generateQuestions(jobDescription.trim(), difficulty);
    return NextResponse.json({ questions });
  } catch (error) {
    // AIGenerationError already carries a specific, user-facing message
    // and a `kind` — both are forwarded as-is so the client can show a
    // distinct message per kind instead of one generic error. "invalid_input"
    // gets 422 (the request was well-formed, but Gemini judged the pasted
    // text unusable as a job description — retrying the same text won't
    // help); "api_error"/"invalid_response" stay 502 (upstream failures,
    // where retrying might). An unrecognized error falls back to 500.
    if (error instanceof AIGenerationError) {
      const status = error.kind === "invalid_input" ? 422 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while generating questions." },
      { status: 500 }
    );
  }
}
