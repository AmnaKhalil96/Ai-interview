// Covers computeAverageScore's rounding (moved here from sessions.ts, same
// behavior) and summarizeSession's aggregation logic — the client-side
// alternative to a 6th AI call, so its correctness matters on its own (see
// the design-decision comment in sessionSummary.ts for why no AI call is
// involved at all).
import { describe, expect, it } from "vitest";
import { computeAverageScore, summarizeSession } from "./sessionSummary";
import type { Feedback } from "@/types";

function feedback(score: number, strengths: string[] = [], gaps: string[] = []): Feedback {
  return { score, strengths, gaps, improvedAnswer: "x" };
}

describe("computeAverageScore", () => {
  it("averages and rounds to one decimal place", () => {
    expect(computeAverageScore([feedback(7), feedback(7), feedback(8)])).toBe(7.3);
  });

  it("returns 0 for an empty list", () => {
    expect(computeAverageScore([])).toBe(0);
  });
});

describe("summarizeSession", () => {
  it("combines the best answer's top strength with the worst answer's top gap", () => {
    const feedbacks = [
      feedback(9, ["Great STAR structure."], ["Could quantify impact."]),
      feedback(4, ["Attempted an answer."], ["Missed the actual question."]),
    ];

    expect(summarizeSession(feedbacks)).toBe(
      "Great STAR structure. One area to focus on next: Missed the actual question."
    );
  });

  it("picks the first-scored question on a tie for best and worst", () => {
    const feedbacks = [
      feedback(6, ["First strength."], ["First gap."]),
      feedback(6, ["Second strength."], ["Second gap."]),
    ];

    expect(summarizeSession(feedbacks)).toBe(
      "First strength. One area to focus on next: First gap."
    );
  });

  it("still produces a summary from a single question", () => {
    const feedbacks = [feedback(8, ["Solid ownership."], ["Light on specifics."])];

    expect(summarizeSession(feedbacks)).toBe(
      "Solid ownership. One area to focus on next: Light on specifics."
    );
  });

  it("falls back to a generic message when there are no feedbacks", () => {
    expect(summarizeSession([])).toMatch(/review the feedback below/i);
  });

  it("falls back gracefully when the best answer has no strengths listed", () => {
    const feedbacks = [feedback(9, [], ["A gap."]), feedback(3, ["A strength."], ["Worse gap."])];

    expect(summarizeSession(feedbacks)).toBe("One area to focus on next: Worse gap.");
  });

  it("falls back gracefully when the worst answer has no gaps listed", () => {
    const feedbacks = [feedback(9, ["A strength."], []), feedback(3, ["Other strength."], [])];

    expect(summarizeSession(feedbacks)).toBe("A strength.");
  });
});
