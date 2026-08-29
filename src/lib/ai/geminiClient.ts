import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  type ModelParams,
} from "@google/generative-ai";
import { AIGenerationError } from "./errors";

// Shared by generateQuestions.ts and evaluateAnswer.ts so both AI call
// sites get the same client-construction, timeout, and error-mapping
// behavior from one place — the same isolation reasoning that already
// keeps everything Gemini-specific inside lib/ai/ (see the top-of-file
// comment in generateQuestions.ts).
//
// Key-fallback design: this app's Gemini key is on the free tier, which
// caps at a low PER-DAY quota (observed: 20 requests/day for
// gemini-3.6-flash) rather than a per-minute rate limit — meaning once
// it's hit, every request fails for the rest of the day, not just a
// transient burst. GEMINI_API_KEY_BACKUP (a second key from a separate
// Google account/project) exists specifically to survive that, not to
// paper over every possible failure:
//
// - Retrying is scoped to quota/rate-limit errors ONLY (a 429 from the
//   Gemini API, surfaced by the SDK as GoogleGenerativeAIFetchError with
//   `status === 429`). Any other failure — a timeout, a malformed
//   response, an invalid API key, a genuine content/safety block — means
//   retrying the exact same request against a second key would either
//   fail identically or (worse) mask a real bug/misconfiguration behind
//   an apparent success. Quota exhaustion is the one failure mode where
//   "the request itself was fine, this specific key's daily allowance
//   wasn't" is actually true, and a different key's separate quota is a
//   legitimate fix.
// - The retry happens exactly once, with the same prompt/schema/timeout,
//   so a fallback success is indistinguishable from a normal success to
//   every caller — parseGenerationResult/parseFeedback and the API
//   routes never know a fallback happened.
// - If GEMINI_API_KEY_BACKUP isn't set, the fallback path is skipped
//   entirely and the original quota error propagates normally — this
//   must work unchanged in any environment that only has one key.
function isQuotaError(error: unknown): boolean {
  return error instanceof GoogleGenerativeAIFetchError && error.status === 429;
}

function toAIGenerationError(error: unknown): AIGenerationError {
  if (error instanceof GoogleGenerativeAIAbortError) {
    return new AIGenerationError("api_error", "The AI is taking too long to respond. Please try again.");
  }
  return new AIGenerationError("api_error", "The AI request failed. Please try again in a moment.");
}

async function callGemini(
  apiKey: string,
  modelParams: ModelParams,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(modelParams);
  const result = await model.generateContent(prompt, { timeout: timeoutMs });
  return result.response.text();
}

export interface GenerateContentWithFallbackOptions {
  modelParams: ModelParams;
  prompt: string;
  timeoutMs: number;
  /** e.g. "[generateQuestions]" — kept per-caller so logs stay traceable
   *  to which AI call failed, matching the pre-fallback logging. */
  logPrefix: string;
}

// Returns the raw response text on success (from the primary key, or the
// backup key after a quota-triggered fallback), or throws AIGenerationError
// with the SAME "api_error" mapping this app already used before fallback
// support existed — the AbortController/timeout behavior (passed through
// via `timeoutMs` on every attempt) and the AIGenerationError taxonomy are
// both untouched by this change.
export async function generateContentWithFallback({
  modelParams,
  prompt,
  timeoutMs,
  logPrefix,
}: GenerateContentWithFallbackOptions): Promise<string> {
  const primaryKey = process.env.GEMINI_API_KEY;
  if (!primaryKey) {
    throw new AIGenerationError(
      "api_error",
      "The AI provider isn't configured (missing GEMINI_API_KEY)."
    );
  }

  try {
    return await callGemini(primaryKey, modelParams, prompt, timeoutMs);
  } catch (error) {
    // Logged server-side (not shown to the user) — the generic user-facing
    // message alone gave no way to tell a rate limit apart from a network
    // stall apart from a bad request when debugging.
    console.error(`${logPrefix} Gemini request failed:`, error);

    const backupKey = process.env.GEMINI_API_KEY_BACKUP;
    if (isQuotaError(error) && backupKey) {
      console.warn(
        `${logPrefix} Primary GEMINI_API_KEY hit a quota/rate-limit error (429) — retrying once with GEMINI_API_KEY_BACKUP.`
      );
      try {
        return await callGemini(backupKey, modelParams, prompt, timeoutMs);
      } catch (backupError) {
        console.error(`${logPrefix} GEMINI_API_KEY_BACKUP also failed:`, backupError);
        throw toAIGenerationError(backupError);
      }
    }

    throw toAIGenerationError(error);
  }
}
