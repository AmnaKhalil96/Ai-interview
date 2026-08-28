import type { Feedback } from "@/types";

interface FormatFeedbackForCopyInput {
  question: string;
  feedback: Feedback;
}

// Plain text, not markdown. This is meant to land in an email, a notes
// app, or a doc a candidate pastes into — markdown syntax (##, **, -)
// would just show up as literal punctuation in most of those targets, so
// spacing and line breaks alone do the formatting work.
export function formatFeedbackForCopy({ question, feedback }: FormatFeedbackForCopyInput): string {
  return [
    `Question: ${question}`,
    "",
    `Score: ${feedback.score}/10`,
    "",
    "Strengths:",
    ...feedback.strengths.map((strength) => `- ${strength}`),
    "",
    "Areas to improve:",
    ...feedback.gaps.map((gap) => `- ${gap}`),
    "",
    "A stronger answer:",
    feedback.improvedAnswer,
  ].join("\n");
}
