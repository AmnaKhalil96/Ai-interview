import { describe, expect, it } from "vitest";
import { formatFeedbackForCopy } from "./formatFeedbackForCopy";
import type { Feedback } from "@/types";

const feedback: Feedback = {
  score: 7,
  strengths: ["Clear ownership of the outcome", "Concrete technical detail"],
  gaps: ["Missing a quantified result"],
  improvedAnswer: "A stronger, more specific version of the answer.",
};

describe("formatFeedbackForCopy", () => {
  it("produces clean plain text with the question, score, strengths, gaps, and improved answer", () => {
    const text = formatFeedbackForCopy({ question: "Tell me about a challenge.", feedback });

    expect(text).toBe(
      [
        "Question: Tell me about a challenge.",
        "",
        "Score: 7/10",
        "",
        "Strengths:",
        "- Clear ownership of the outcome",
        "- Concrete technical detail",
        "",
        "Areas to improve:",
        "- Missing a quantified result",
        "",
        "A stronger answer:",
        "A stronger, more specific version of the answer.",
      ].join("\n")
    );
  });

  it("contains no markdown syntax characters", () => {
    const text = formatFeedbackForCopy({ question: "Q", feedback });

    expect(text).not.toMatch(/[#*`]/);
  });

  it("handles empty strengths/gaps lists without leaving stray bullets", () => {
    const empty: Feedback = { score: 5, strengths: [], gaps: [], improvedAnswer: "Better answer." };

    const text = formatFeedbackForCopy({ question: "Q", feedback: empty });

    expect(text).not.toContain("- ");
  });
});
