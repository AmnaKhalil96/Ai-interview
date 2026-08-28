import type { Difficulty } from "@/types";

// Shared between the landing page's selector, the API route's validation,
// and the session/history pages' display — one list instead of the value
// and its label being redeclared at each call site. The Gemini prompt
// guidance for each level lives in lib/ai/generateQuestions.ts instead,
// since that's a prompt-engineering detail specific to that one module, not
// something the UI or the route ever needs to know.
export const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
];

// Pre-selected on the landing page so pasting a job description and
// clicking "Start practice" keeps working exactly as it did before this
// feature existed — picking a difficulty is an optional refinement, not a
// new required step.
export const DEFAULT_DIFFICULTY: Difficulty = "mid";

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "entry" || value === "mid" || value === "senior";
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? difficulty;
}
