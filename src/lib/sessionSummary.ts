import type { Feedback } from "@/types";

// Moved here from being a private helper inside lib/sessions.ts so the
// summary screen (session/page.tsx) can compute the same number the instant
// the last question is answered, without waiting on saveSession's Firestore
// round trip — every input it needs (the feedbacks already collected in
// page state) is available before that write even starts.
export function computeAverageScore(feedbacks: Feedback[]): number {
  if (feedbacks.length === 0) return 0;
  const total = feedbacks.reduce((sum, feedback) => sum + feedback.score, 0);
  return Math.round((total / feedbacks.length) * 10) / 10;
}

const FALLBACK_SUMMARY =
  "You completed the session — review the feedback below to see where to focus next.";

// Design decision (see the task write-up this satisfies): the one-line
// summary is aggregated from the per-question feedback Gemini already
// returned, NOT a new AI call. Three reasons:
//
//  1. Reliability — a 6th network call, fired right as the user finishes
//     the session, is one more request that can time out or fail, with
//     nothing useful to show if it does. Aggregating locally can't fail at
//     all: the data it needs already exists in the page's own state.
//  2. Groundedness — evaluateAnswer.ts's own rubric already insists every
//     strength/gap be "grounded in what the candidate actually said rather
//     than generic advice." A fresh summarization prompt would have to
//     re-derive that groundedness from a pile of JSON with no guarantee it
//     stays specific. Reusing the single best-scoring answer's top
//     strength and the single worst-scoring answer's top gap keeps the
//     summary exactly as concrete as the per-question feedback it's built
//     from — it literally can't say anything the model didn't already say
//     about a real answer.
//  3. Cost/latency — this is free and instant; a real summarization call
//     would add real latency and real API cost for one line of text.
//
// Ties (equal scores) resolve to the first occurrence in `feedbacks`, i.e.
// the earliest-answered question — arbitrary but deterministic, which
// matters for testing.
export function summarizeSession(feedbacks: Feedback[]): string {
  if (feedbacks.length === 0) return FALLBACK_SUMMARY;

  const best = feedbacks.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = feedbacks.reduce((a, b) => (b.score < a.score ? b : a));

  const strength = best.strengths[0];
  const gap = worst.gaps[0];

  if (strength && gap) return `${strength} One area to focus on next: ${gap}`;
  if (strength) return strength;
  if (gap) return `One area to focus on next: ${gap}`;
  return FALLBACK_SUMMARY;
}
