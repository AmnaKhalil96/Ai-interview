// Covers that real feedback data (score, strengths, gaps, improved answer)
// actually reaches the screen, the conditional "Next question" /
// "Finish session" / "Retry this question" / no-advance-button branching
// that lets this same component serve both the live session page and the
// read-only history page, and that the Copy feedback button (always
// present, unlike the advance/retry buttons) is wired up with the right
// question text.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackDisplay from "./FeedbackDisplay";
import type { Feedback } from "@/types";

const feedback: Feedback = {
  score: 7,
  strengths: ["Clear ownership of the outcome", "Concrete technical detail"],
  gaps: ["Missing a quantified result"],
  improvedAnswer: "A stronger, more specific version of the answer.",
};
const question = "Tell me about a time you led a project.";

// None of these tests click the always-rendered Copy feedback button (its
// own behavior is covered by CopyFeedbackButton.test.tsx) — they only
// assert it's present — so navigator.clipboard never actually needs to be
// mocked here.

describe("FeedbackDisplay", () => {
  it("renders the score", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} />);

    expect(screen.getByRole("img", { name: "Score: 7 out of 10" })).toBeInTheDocument();
  });

  it("renders every strength and every gap", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} />);

    for (const strength of feedback.strengths) {
      expect(screen.getByText(strength)).toBeInTheDocument();
    }
    for (const gap of feedback.gaps) {
      expect(screen.getByText(gap)).toBeInTheDocument();
    }
  });

  it("renders the improved answer", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} />);

    expect(screen.getByText(feedback.improvedAnswer)).toBeInTheDocument();
  });

  it("always renders the Copy feedback button, even read-only (history use)", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} />);

    expect(screen.getByRole("button", { name: /copy feedback/i })).toBeInTheDocument();
  });

  it("does not render an advance or retry button when neither onNext nor onRetry is provided (read-only history use)", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} />);

    expect(screen.queryByRole("button", { name: /next question/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finish session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry this question/i })).not.toBeInTheDocument();
  });

  it('labels the button "Next question" and calls onNext when not the last question', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<FeedbackDisplay feedback={feedback} question={question} isLastQuestion={false} onNext={onNext} />);

    const button = screen.getByRole("button", { name: /next question/i });
    await user.click(button);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('labels the button "Finish session" when it is the last question', () => {
    render(<FeedbackDisplay feedback={feedback} question={question} isLastQuestion onNext={vi.fn()} />);

    expect(screen.getByRole("button", { name: /finish session/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next question/i })).not.toBeInTheDocument();
  });

  it("renders a Retry this question button and calls onRetry when clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FeedbackDisplay feedback={feedback} question={question} onNext={vi.fn()} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: /retry this question/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render the Retry button when onRetry isn't provided", () => {
    render(<FeedbackDisplay feedback={feedback} question={question} onNext={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /retry this question/i })).not.toBeInTheDocument();
  });
});
