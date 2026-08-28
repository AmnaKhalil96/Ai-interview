import { GoogleGenerativeAI, GoogleGenerativeAIAbortError, SchemaType } from "@google/generative-ai";
import type { Difficulty, Question, QuestionType } from "@/types";
import { AIGenerationError } from "./errors";

// Every Gemini-specific detail (the SDK, the model name, the response
// schema, the raw-text parsing) stays inside this one file. The rest of
// the app only ever imports `generateQuestions` and `AIGenerationError` —
// neither of which mention Gemini. Swapping to Anthropic's API later means
// rewriting the inside of this file only; the API route, the landing page
// and the Question type it returns don't change. evaluateAnswer.ts (the
// sibling module for scoring answers) follows this exact same shape for
// the same reason.
// gemini-2.0-flash was retired; gemini-3.6-flash is the current stable
// flash-tier model as of this writing. If Google retires this one too,
// this is the only line that needs to change.
const MODEL_NAME = "gemini-3.6-flash";
const QUESTION_COUNT = 5;
const BEHAVIORAL_COUNT = 3;
const TECHNICAL_COUNT = 2;

// Long enough for a normal ~5-10s generation, short enough that a stalled
// request doesn't leave the "Generating questions…" button spinning for
// minutes — see the matching timeout in lib/sessions.ts for the same
// reasoning applied to Firestore calls. Passed as the SDK's own `timeout`
// option (not a manual Promise.race) because the SDK's RequestOptions
// already wires this into a real AbortController tied to the underlying
// fetch — genuinely cancels the in-flight request instead of just walking
// away from it.
const GEMINI_TIMEOUT_MS = 20_000;

const DEFAULT_INVALID_INPUT_MESSAGE =
  "This doesn't look like a job description. Please paste the actual job posting text (role, responsibilities, requirements).";

// Kept here (not in lib/difficulty.ts) because this is prompt-engineering
// wording specific to this one Gemini call, not something the UI or the
// API route needs — same reasoning as MODEL_NAME and the response schema
// staying inside this module. Each entry calibrates both what the
// questions probe and how hard they should be to answer well.
const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  entry:
    "Calibrate for an ENTRY-LEVEL candidate (little to no professional experience). Focus on fundamentals, simple and concrete scenarios, and knowledge someone could reasonably have from school, internships, or personal projects. Avoid questions that assume years of production experience, team leadership, or open-ended system design.",
  mid: "Calibrate for a MID-LEVEL candidate (a few years of hands-on experience). Focus on practical trade-offs they'd have actually faced, moderate technical depth, and decisions made within a defined scope — not fundamentals, but not open-ended architecture or org-level leadership either.",
  senior:
    "Calibrate for a SENIOR candidate. Favor architecture and system design, technical leadership and mentorship, and ambiguous or complex scenarios with competing constraints and no single obviously-correct answer — the kind of question that reveals judgment, not just knowledge.",
};

// Re-exported so existing call sites (the API route) can keep importing
// both `generateQuestions` and `AIGenerationError` from this one module
// instead of also reaching into lib/ai/errors directly.
export { AIGenerationError };

// Bug fix: this endpoint used to generate plausible-looking interview
// questions for literally any input, including gibberish or text
// unrelated to a job posting, because nothing ever asked "is this
// actually a job description?" — the prompt just assumed it was.
//
// Fixed by folding a validity check into the SAME generation call rather
// than adding a second, separate "is this valid?" call beforehand. A
// second call would double the latency and cost of every single request
// just to filter out a rare case, and this model doesn't need a dedicated
// call to make that judgment — it can decide validity and, in the same
// pass, either explain why not or write the questions, as one coherent
// piece of reasoning. responseSchema (below) makes "isValidJobDescription"
// and "questions" both real fields of one JSON object, so structured
// output enforces that shape either way. The trade-off: if Gemini's
// judgment call is ever wrong (a terse-but-real posting misread as
// gibberish), there's no separate validator to catch that — acceptable
// here since a rejected real job description just means the user pastes
// it again, or edits the wording, not a lost session.
function buildPrompt(jobDescription: string, difficulty: Difficulty): string {
  // Explicit counts (5 total, 3+2) and "specific to this role, not
  // generic" steer the model away from stock interview-question lists.
  // The JSON shape is restated here even though we also pass a
  // responseSchema below — the schema constrains Gemini's structured
  // output, but spelling it out in the prompt too costs nothing and is
  // the only enforcement if a future provider swap drops schema support.
  return `You are an interview preparation coach helping someone practice for a job interview.

First, decide whether the text below is a plausible job description or job posting — it should reference things like a role or title, responsibilities, required skills, or qualifications. Gibberish, a single repeated word or phrase, or coherent text that simply isn't a job posting (a recipe, a story, source code, a news article, etc.) is NOT a valid job description.

If it is NOT a valid job description: set "isValidJobDescription" to false, set "reason" to one short sentence explaining why, and set "questions" to an empty array.

If it IS a valid job description: set "isValidJobDescription" to true, set "reason" to an empty string, and write exactly ${QUESTION_COUNT} interview questions for a candidate applying to it: ${BEHAVIORAL_COUNT} behavioral and ${TECHNICAL_COUNT} technical.

${DIFFICULTY_GUIDANCE[difficulty]}

Behavioral questions should probe past experience, judgement, and collaboration relevant to this specific role. Technical questions should probe hands-on skills and knowledge the job description implies. Write questions specific to this role and its stated responsibilities — avoid generic, could-apply-to-any-job questions.

Return ONLY a JSON object, no markdown code fences, no preamble or explanation, matching exactly this shape:
{ "isValidJobDescription": true, "reason": "", "questions": [{ "id": "q1", "type": "behavioral", "question": "..." }, ...] }

Text to assess:
"""
${jobDescription}
"""`;
}

// Belt-and-suspenders: responseMimeType + responseSchema (below) already
// ask Gemini for bare JSON, but models occasionally wrap output in
// ```json fences anyway. Stripping them here costs nothing and avoids a
// JSON.parse failure over a formatting quirk that isn't really a bad
// response.
function stripCodeFences(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text.trim();
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === "behavioral" || value === "technical";
}

function parseQuestionsArray(value: unknown): Question[] {
  if (!Array.isArray(value) || value.length !== QUESTION_COUNT) {
    throw new AIGenerationError(
      "invalid_response",
      `The AI response was malformed — expected ${QUESTION_COUNT} questions.`
    );
  }

  return value.map((item, index) => {
    const record = item as Record<string, unknown> | null;
    const hasValidShape =
      record !== null &&
      typeof record === "object" &&
      typeof record.id === "string" &&
      typeof record.question === "string" &&
      record.question.trim().length > 0 &&
      isQuestionType(record.type);

    if (!hasValidShape || !record) {
      throw new AIGenerationError(
        "invalid_response",
        `The AI response was malformed — question ${index + 1} didn't match the expected shape.`
      );
    }

    return {
      id: record.id as string,
      type: record.type as QuestionType,
      question: record.question as string,
    };
  });
}

// Never trust that "valid JSON" means "the JSON we asked for" — a model
// can return well-formed JSON that's the wrong shape (missing fields,
// wrong types, wrong length, or — new here — a validity verdict that
// doesn't match what it actually returned). Every failure mode is
// distinguished so the caller gets an honest, specific message instead of
// a generic crash or a silently wrong Question[].
function parseGenerationResult(rawText: string): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    throw new AIGenerationError(
      "invalid_response",
      "The AI response was malformed — it wasn't valid JSON."
    );
  }

  const record = parsed as Record<string, unknown> | null;
  if (record === null || typeof record !== "object" || typeof record.isValidJobDescription !== "boolean") {
    throw new AIGenerationError(
      "invalid_response",
      "The AI response was malformed — it didn't match the expected shape."
    );
  }

  if (!record.isValidJobDescription) {
    const reason =
      typeof record.reason === "string" && record.reason.trim().length > 0
        ? record.reason.trim()
        : null;
    throw new AIGenerationError(
      "invalid_input",
      reason ? `This doesn't look like a job description — ${reason}` : DEFAULT_INVALID_INPUT_MESSAGE
    );
  }

  return parseQuestionsArray(record.questions);
}

export async function generateQuestions(jobDescription: string, difficulty: Difficulty): Promise<Question[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIGenerationError(
      "api_error",
      "The AI provider isn't configured (missing GEMINI_API_KEY)."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          isValidJobDescription: { type: SchemaType.BOOLEAN },
          reason: { type: SchemaType.STRING },
          questions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                id: { type: SchemaType.STRING },
                type: { type: SchemaType.STRING, format: "enum", enum: ["behavioral", "technical"] },
                question: { type: SchemaType.STRING },
              },
              required: ["id", "type", "question"],
            },
          },
        },
        required: ["isValidJobDescription", "reason", "questions"],
      },
    },
  });

  let responseText: string;
  try {
    const result = await model.generateContent(buildPrompt(jobDescription, difficulty), {
      timeout: GEMINI_TIMEOUT_MS,
    });
    responseText = result.response.text();
  } catch (error) {
    // Logged server-side (not shown to the user) — see the matching
    // comment in evaluateAnswer.ts for why.
    console.error("[generateQuestions] Gemini request failed:", error);
    if (error instanceof GoogleGenerativeAIAbortError) {
      throw new AIGenerationError(
        "api_error",
        "The AI is taking too long to respond. Please try again."
      );
    }
    throw new AIGenerationError(
      "api_error",
      "The AI request failed. Please try again in a moment."
    );
  }

  return parseGenerationResult(responseText);
}
