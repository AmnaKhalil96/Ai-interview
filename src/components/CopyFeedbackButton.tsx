"use client";

import { useState } from "react";
import { formatFeedbackForCopy } from "@/lib/formatFeedbackForCopy";
import type { Feedback } from "@/types";

interface CopyFeedbackButtonProps {
  question: string;
  feedback: Feedback;
}

// Long enough to read "Copied!" without it disappearing mid-glance, short
// enough that the button is back to its normal label well before someone
// would plausibly want to copy a second time.
const CONFIRMATION_MS = 2000;

// A small text-style action (matching the "Sign out" / "Start practicing"
// underline-link treatment elsewhere) rather than the full-width Button
// primitive — this is a secondary, low-stakes action that shouldn't
// visually compete with the screen's actual primary button (Next question /
// Finish session / Retry).
export default function CopyFeedbackButton({ question, feedback }: CopyFeedbackButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatFeedbackForCopy({ question, feedback }));
      setCopied(true);
      setTimeout(() => setCopied(false), CONFIRMATION_MS);
    } catch {
      // Clipboard permission denied, or the API isn't available at all
      // (e.g. an insecure context) — nothing to recover into beyond
      // leaving the button in its normal state. The feedback text is
      // still fully visible on screen for the user to select manually.
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* py-2 -my-2 grows the tap target toward a comfortable ~44px height
          without pushing the surrounding layout — the negative margin
          cancels the added padding's effect on neighboring spacing, so
          this still looks like a plain text link, just easier to hit. */}
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="-my-2 py-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        {copied ? "Copied!" : "Copy feedback"}
      </button>
      {/* Separate from the button's own visible label so screen readers
          get an explicit announcement of the state change — a button's
          text content changing on its own isn't reliably announced across
          browsers/AT combinations without a dedicated live region. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Feedback copied to clipboard." : ""}
      </span>
    </div>
  );
}
