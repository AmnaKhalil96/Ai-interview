// Covers the clipboard write actually happening with the correctly
// formatted text, the button's "Copied!" confirmation appearing and then
// reverting after the timeout, the aria-live announcement carrying the same
// confirmation for screen readers, and that a rejected clipboard write
// (permission denied / unsupported) doesn't crash the component.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyFeedbackButton from "./CopyFeedbackButton";
import { formatFeedbackForCopy } from "@/lib/formatFeedbackForCopy";
import type { Feedback } from "@/types";

const feedback: Feedback = {
  score: 6,
  strengths: ["A strength."],
  gaps: ["A gap."],
  improvedAnswer: "An improved answer.",
};
const question = "Tell me about a challenge.";

// userEvent.setup() installs its own clipboard stub on navigator.clipboard
// (to support user.copy()/user.paste()) — calling this AFTER setup() is
// required, or userEvent's stub silently overwrites this mock and every
// assertion on `writeText` would just observe a call that never happened.
function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CopyFeedbackButton", () => {
  it("copies the formatted question/score/strengths/gaps/improved answer to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyFeedbackButton question={question} feedback={feedback} />);

    await user.click(screen.getByRole("button", { name: /copy feedback/i }));

    expect(writeText).toHaveBeenCalledWith(formatFeedbackForCopy({ question, feedback }));
  });

  it('changes the button label to "Copied!" after a successful copy', async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyFeedbackButton question={question} feedback={feedback} />);

    await user.click(screen.getByRole("button", { name: /copy feedback/i }));

    expect(await screen.findByRole("button", { name: /^copied!$/i })).toBeInTheDocument();
  });

  it("announces the confirmation via an aria-live region", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyFeedbackButton question={question} feedback={feedback} />);

    await user.click(screen.getByRole("button", { name: /copy feedback/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/copied to clipboard/i);
  });

  it('reverts the label back to "Copy feedback" after the confirmation window', async () => {
    // fireEvent (not userEvent) here: userEvent's click simulates realistic
    // pointer-event timing via its own internal delays, which don't mix
    // well with fake timers globally replacing setTimeout — fireEvent
    // dispatches the click synchronously with no timing of its own, which
    // is all this test needs (the click itself is already covered by the
    // userEvent-based tests above).
    vi.useFakeTimers();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyFeedbackButton question={question} feedback={feedback} />);

    fireEvent.click(screen.getByRole("button", { name: /copy feedback/i }));
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /^copied!$/i })).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.getByRole("button", { name: /^copy feedback$/i })).toBeInTheDocument();
  });

  it("does not crash and stays in its normal state when the clipboard write fails", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    render(<CopyFeedbackButton question={question} feedback={feedback} />);

    await user.click(screen.getByRole("button", { name: /copy feedback/i }));

    expect(screen.getByRole("button", { name: /^copy feedback$/i })).toBeInTheDocument();
  });
});
