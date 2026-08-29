import { SchemaType } from "@google/generative-ai";
import type { Feedback, QuestionType } from "@/types";
import { AIGenerationError } from "./errors";
import { generateContentWithFallback } from "./geminiClient";

// Mirrors generateQuestions.ts on purpose: same isolation rationale (every
// Gemini-specific detail — SDK, model name, schema, raw-text parsing —
// stays in this one file so the rest of the app only sees `evaluateAnswer`
// and `Feedback`), same JSON-parsing safety approach (strip fences, guard
// JSON.parse, validate shape before trusting it), and the same
// AIGenerationError taxonomy so the two API routes handle failures
// identically. Keeping the two files structurally parallel means a future
// provider swap is "apply the same edit to both files," not "relearn two
// different patterns."
const MODEL_NAME = "gemini-3.6-flash";

// See the matching constant in generateQuestions.ts: passed as the SDK's
// own `timeout` RequestOptions field rather than a manual Promise.race,
// because the SDK wires that option into a real AbortController tied to
// the underlying fetch — it genuinely cancels the in-flight request
// instead of just walking away from it.
const GEMINI_TIMEOUT_MS = 20_000;

export { AIGenerationError };

interface EvaluateAnswerInput {
  question: string;
  questionType: QuestionType;
  answer: string;
}

function buildPrompt({ question, questionType, answer }: EvaluateAnswerInput): string {
  // The two question types call for genuinely different rubrics, not just
  // different wording: a behavioral answer is judged as a story (did it
  // establish a real situation, a personal action, a concrete result?),
  // while a technical answer is judged as an explanation (is it actually
  // correct, and does it cover the scope of what was asked?). Grading both
  // against one generic "was this good?" prompt would blur that
  // distinction and produce vaguer, less actionable feedback.
  const rubric =
    questionType === "behavioral"
      ? `Evaluate this answer using the STAR method (Situation, Task, Action, Result). A strong answer clearly establishes the situation and task, describes concrete actions the candidate personally took (not just what "we" did as a team), and states a clear or measurable result. Call out which of these four elements is missing, vague, or under-developed.`
      : `Evaluate this answer for technical correctness (is the reasoning or approach actually right), clarity (is it well-explained and easy to follow), and completeness (does it address edge cases, trade-offs, or the full scope of what was asked).`;

  return `You are an experienced interview coach scoring one candidate's answer to a single interview question.

Question (${questionType}): "${question}"

Candidate's answer:
"""
${answer}
"""

${rubric}

Score the answer from 1 (poor) to 10 (excellent) as an integer. List 2-4 specific strengths and 2-4 specific gaps, each grounded in what the candidate actually said rather than generic advice. Then write a concise improved version of the answer (2-5 sentences) that fixes the identified gaps while staying true to the candidate's original experience where possible.

Return ONLY a JSON object, no markdown code fences, no preamble, matching exactly this shape:
{ "score": 7, "strengths": ["...", "..."], "gaps": ["...", "..."], "improvedAnswer": "..." }`;
}

function stripCodeFences(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text.trim();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Same principle as parseQuestions in generateQuestions.ts: valid JSON
// isn't the same guarantee as "the JSON we asked for." A model can return
// well-formed JSON missing a field, with the wrong types, or with a score
// outside 1-10 — all validated here before the caller ever sees a Feedback.
function parseFeedback(rawText: string): Feedback {
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
  const hasValidShape =
    record !== null &&
    typeof record === "object" &&
    typeof record.score === "number" &&
    Number.isInteger(record.score) &&
    record.score >= 1 &&
    record.score <= 10 &&
    isStringArray(record.strengths) &&
    isStringArray(record.gaps) &&
    typeof record.improvedAnswer === "string" &&
    record.improvedAnswer.trim().length > 0;

  if (!hasValidShape || !record) {
    throw new AIGenerationError(
      "invalid_response",
      "The AI response was malformed — it didn't match the expected feedback shape."
    );
  }

  return {
    score: record.score as number,
    strengths: record.strengths as string[],
    gaps: record.gaps as string[],
    improvedAnswer: record.improvedAnswer as string,
  };
}

export async function evaluateAnswer(input: EvaluateAnswerInput): Promise<Feedback> {
  const responseText = await generateContentWithFallback({
    modelParams: {
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            score: { type: SchemaType.INTEGER },
            strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            gaps: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            improvedAnswer: { type: SchemaType.STRING },
          },
          required: ["score", "strengths", "gaps", "improvedAnswer"],
        },
      },
    },
    prompt: buildPrompt(input),
    timeoutMs: GEMINI_TIMEOUT_MS,
    logPrefix: "[evaluateAnswer]",
  });

  return parseFeedback(responseText);
}
