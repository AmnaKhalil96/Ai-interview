import Kicker from "@/components/ui/Kicker";
import ScoreRing from "@/components/ui/ScoreRing";
import Button from "@/components/ui/Button";
import CopyFeedbackButton from "@/components/CopyFeedbackButton";
import type { Feedback } from "@/types";

interface FeedbackDisplayProps {
  feedback: Feedback;
  // Required (not optional like isLastQuestion/onNext/onRetry below)
  // because both call sites — the live session page and the history
  // detail view — always have the question text on hand, and
  // CopyFeedbackButton needs it to build the copied text regardless of
  // which page rendered this component.
  question: string;
  // Optional so the history page can reuse this component read-only (past
  // sessions have nothing to advance to or retry) without either prop —
  // the live session page is the only caller that passes onNext/onRetry.
  isLastQuestion?: boolean;
  onNext?: () => void;
  // Resets just the current question's answer/feedback so the candidate
  // can attempt it again — see the retry handler in session/page.tsx for
  // why this doesn't need any "discard the previous attempt" logic here:
  // nothing about this question is saved anywhere until onNext is called.
  onRetry?: () => void;
}

// Strengths and gaps are told apart by marker shape (filled dot vs hollow
// ring) plus a text label, not by a red/green traffic-light color pair —
// this app commits to one accent color, and a second "danger" color would
// break that and add a contrast pairing nobody's checked.
export default function FeedbackDisplay({
  feedback,
  question,
  isLastQuestion,
  onNext,
  onRetry,
}: FeedbackDisplayProps) {
  return (
    <div className="flex flex-col gap-8 rounded-md border border-line bg-paper-raised p-6 text-left sm:p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <ScoreRing score={feedback.score} />
        <Kicker>Score</Kicker>
      </div>

      {/* grid-cols-1 explicitly, not just bare `grid` — without a base
          column count, grid-template-columns stays "none" below sm, and
          implicit "auto"-sized tracks size to their content's max-content
          width instead of the container's actual width. That's invisible
          with short feedback text (an auto track sized to a short string
          still happens to look "full width"), but a genuinely long
          unbroken word in Gemini's response would balloon the whole grid
          — and everything in it, including the short "Strengths"/"Areas
          to improve" labels next to it — to that content's width,
          regardless of viewport. grid-cols-1 uses minmax(0,1fr) tracks,
          which have a real, shrinkable basis instead of auto-sizing to
          content. */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Kicker>Strengths</Kicker>
          <ul className="flex flex-col gap-2">
            {feedback.strengths.map((strength) => (
              <li key={strength} className="flex gap-3 text-sm leading-relaxed text-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {/* min-w-0 is required for break-words to actually do anything
                    here — a bare text node inside a flex row is an anonymous
                    flex item whose default min-width is the width of its
                    longest unbreakable token, not 0, so without this an
                    unusually long AI-generated word/term could push this
                    item (and the page) wider than the viewport instead of
                    wrapping. Same underlying bug as the summary breakdown
                    list's truncate fix — different symptom, same fix. */}
                <span className="min-w-0 flex-1 break-words">{strength}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Kicker>Areas to improve</Kicker>
          <ul className="flex flex-col gap-2">
            {feedback.gaps.map((gap) => (
              <li key={gap} className="flex gap-3 text-sm leading-relaxed text-ink">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full border border-ink-soft"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 break-words">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>A stronger answer</Kicker>
        <blockquote className="break-words border-l-2 border-accent bg-paper px-4 py-3 text-sm italic leading-relaxed text-ink-soft">
          {feedback.improvedAnswer}
        </blockquote>
      </div>

      {/* flex-col on mobile so Copy feedback and the action button(s) each
          get their own full-width row instead of relying on flex-wrap to
          sort out two nested w-full buttons — deterministic stacking
          rather than whatever the wrap algorithm happens to do at a given
          width. Row layout returns at sm and up. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <CopyFeedbackButton question={question} feedback={feedback} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:ml-auto">
          {onRetry && (
            <Button type="button" variant="secondary" onClick={onRetry} className="sm:w-auto">
              Retry this question
            </Button>
          )}
          {onNext && (
            <Button type="button" onClick={onNext} className="sm:w-auto">
              {isLastQuestion ? "Finish session" : "Next question"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
