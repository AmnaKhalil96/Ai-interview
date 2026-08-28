// Shared domain types, kept in one place (rather than inline in each
// component) because Question/Feedback/Session all flow between the setup
// page, the session page, Firestore, and the history page — a change to
// any of these shapes has to be visible everywhere it's used at once.

export type QuestionType = "behavioral" | "technical";

// The three calibration levels offered on the landing page — see
// lib/difficulty.ts for the display labels, the list used to render the
// selector, and the validation guard used by the API route.
export type Difficulty = "entry" | "mid" | "senior";

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
}

export interface Feedback {
  score: number;
  strengths: string[];
  gaps: string[];
  improvedAnswer: string;
}

// Mirrors the Firestore "sessions" document shape (see lib/sessions.ts),
// except createdAt: Firestore stores that as a Timestamp, but this app-wide
// type uses a plain ISO string instead. lib/sessions.ts is the only file
// that converts between the two — the same isolation approach as the AI
// provider modules, applied to Firestore instead of Gemini, so nothing
// outside that one file needs to import firebase/firestore's Timestamp type.
export interface Session {
  id: string;
  userId: string;
  jobDescription: string;
  difficulty: Difficulty;
  questions: Question[];
  answers: string[];
  feedbacks: Feedback[];
  createdAt: string;
  averageScore: number;
}
