import { isDifficulty } from "@/lib/difficulty";
import type { Difficulty, Question } from "@/types";

// The landing page (writer) and the session page (reader) both need to
// agree on the sessionStorage key and the exact shape stored under it.
// Putting both here — instead of each page re-declaring its own key
// string and JSON.parse call — means there's exactly one place that can
// get the contract wrong.
const STORAGE_KEY = "interviewiq:practice-session";

export interface PracticeSession {
  jobDescription: string;
  difficulty: Difficulty;
  questions: Question[];
}

export function savePracticeSession(session: PracticeSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

// Returns null both when nothing is stored and when what's stored doesn't
// parse into the expected shape — callers only need to know "is there a
// usable session or not," not why one might be missing.
export function loadPracticeSession(): PracticeSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PracticeSession> | null;
    if (
      parsed &&
      typeof parsed.jobDescription === "string" &&
      isDifficulty(parsed.difficulty) &&
      Array.isArray(parsed.questions)
    ) {
      return {
        jobDescription: parsed.jobDescription,
        difficulty: parsed.difficulty,
        questions: parsed.questions,
      };
    }
    return null;
  } catch {
    return null;
  }
}
