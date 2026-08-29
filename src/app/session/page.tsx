"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Kicker from "@/components/ui/Kicker";
import Button from "@/components/ui/Button";
import ScoreRing from "@/components/ui/ScoreRing";
import AnswerInput from "@/components/AnswerInput";
import FeedbackDisplay from "@/components/FeedbackDisplay";
import { loadPracticeSession, type PracticeSession } from "@/lib/practiceSession";
import { saveSession } from "@/lib/sessions";
import { computeAverageScore, summarizeSession } from "@/lib/sessionSummary";
import { difficultyLabel } from "@/lib/difficulty";
import { useAuth } from "@/components/AuthProvider";
import type { Feedback } from "@/types";

type EvalStatus = "idle" | "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

// Question generation happens on the landing page and is handed off via
// sessionStorage (see practiceSession.ts) — this page owns the rest of the
// practice loop: showing one question at a time, collecting an answer,
// calling the evaluation API, advancing, and — once all questions are
// answered — saving the whole session to Firestore (lib/sessions.ts) so it
// shows up on the history page.
export default function SessionPage() {
  // undefined = "haven't checked sessionStorage yet" (avoids a flash of
  // the empty state during the first render), null = "checked, nothing
  // usable was there."
  const [session, setSession] = useState<PracticeSession | null | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evalStatus, setEvalStatus] = useState<EvalStatus>("idle");
  const [evalError, setEvalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // A ref alongside saveStatus guards against firing the Firestore write
  // twice — React 18 Strict Mode intentionally double-invokes effects in
  // development, and without this guard that would create two documents
  // for one finished session.
  const hasSavedRef = useRef(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Focus management for the two in-page transitions a keyboard/screen
  // reader user can trigger here: advancing to the next question, and
  // retrying the current one. Neither is a real navigation (no URL
  // change, no full page load), so none of the browser's normal
  // focus-on-navigate behavior applies — without this, clicking "Next
  // question" unmounts the old feedback view's "Next question" button
  // and focus silently falls back to <body>, leaving a keyboard/AT user
  // with no indication anything happened or where they are now.
  // questionViewKey is bumped on every such transition and deliberately
  // NOT on first mount (index 0), since a real page load already gets
  // normal browser/AT focus behavior for free.
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const [questionViewKey, setQuestionViewKey] = useState(0);

  useEffect(() => {
    if (questionViewKey === 0) return;
    questionHeadingRef.current?.focus();
  }, [questionViewKey]);

  useEffect(() => {
    if (!sessionComplete) return;
    summaryHeadingRef.current?.focus();
  }, [sessionComplete]);

  useEffect(() => {
    setSession(loadPracticeSession());
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!sessionComplete || !session || !user || hasSavedRef.current) return;
    hasSavedRef.current = true;
    setSaveStatus("saving");
    saveSession({
      userId: user.uid,
      jobDescription: session.jobDescription,
      difficulty: session.difficulty,
      questions: session.questions,
      answers,
      feedbacks,
    })
      .then(() => setSaveStatus("saved"))
      .catch(() => setSaveStatus("error"));
  }, [sessionComplete, session, user, answers, feedbacks]);

  async function submitAnswer() {
    if (!session) return;
    const currentQuestion = session.questions[currentIndex];
    if (!answer.trim()) return;

    setEvalStatus("loading");
    setEvalError(null);

    try {
      // The route requires a verified Firebase ID token (see
      // requireAuthenticatedRequest.ts) — `user` is guaranteed non-null
      // here since this page redirects to /login otherwise (see the
      // effect above).
      const idToken = await user?.getIdToken();
      const response = await fetch("/api/evaluate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          question: currentQuestion.question,
          questionType: currentQuestion.type,
          answer: answer.trim(),
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Something went wrong evaluating your answer.";
        setEvalStatus("error");
        setEvalError(message);
        return;
      }

      const { feedback: receivedFeedback } = data as { feedback: Feedback };
      setFeedback(receivedFeedback);
      setEvalStatus("success");
    } catch {
      setEvalStatus("error");
      setEvalError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function handleNext() {
    if (!session || !feedback) return;

    const nextAnswers = [...answers, answer.trim()];
    const nextFeedbacks = [...feedbacks, feedback];
    setAnswers(nextAnswers);
    setFeedbacks(nextFeedbacks);

    if (currentIndex === session.questions.length - 1) {
      setSessionComplete(true);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setAnswer("");
    setFeedback(null);
    setEvalStatus("idle");
    setEvalError(null);
    setQuestionViewKey((key) => key + 1);
  }

  // Resets this question back to a blank input without touching
  // currentIndex, answers, or feedbacks — those arrays only ever gain an
  // entry for this question inside handleNext, which hasn't run yet at
  // the point a retry is possible (it only becomes reachable again once
  // the candidate re-submits and clicks Next). So there's nothing to
  // "replace": whatever gets submitted after a retry is simply the only
  // attempt that ever reaches handleNext for this question.
  function handleRetry() {
    setAnswer("");
    setFeedback(null);
    setEvalStatus("idle");
    setEvalError(null);
    setQuestionViewKey((key) => key + 1);
  }

  if (session === undefined || authLoading || !user) {
    return <main className="min-h-screen bg-paper" />;
  }

  if (session === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center sm:px-10">
        <Kicker index="02">Interview session</Kicker>
        {/* w-full matters here specifically because the parent is a flex
            column with items-center: without a definite width, a flex
            item aligned via items-center (rather than stretched) sizes to
            its own content instead of the container, so max-w-* only ever
            caps a width that was never actually being applied. w-full
            gives it a real, shrinkable width (capped by max-w-*) for
            text wrapping to work against. */}
        <h1 className="w-full max-w-md break-words font-display text-3xl text-ink">
          No practice session found.
        </h1>
        <p className="w-full max-w-sm break-words text-sm leading-relaxed text-ink-soft">
          Paste a job description on the landing page to generate questions
          first.
        </p>
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.2em] text-accent underline underline-offset-4"
        >
          Back to landing page
        </Link>
      </main>
    );
  }

  if (sessionComplete) {
    // Computed from `feedbacks` directly rather than waiting for
    // saveStatus === "saved" — every number and word this screen shows
    // already exists in this page's own state the instant the last
    // question is answered, so the summary doesn't need to wait on (or
    // depend on the success of) the Firestore write happening in
    // parallel. See sessionSummary.ts for why summarizeSession is a local
    // aggregation rather than a 6th AI call.
    const averageScore = computeAverageScore(feedbacks);
    const summary = summarizeSession(feedbacks);

    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center gap-8 px-6 py-16 text-center sm:px-10">
        {/* Visually hidden: the Kicker right below already shows "Session
            complete" prominently for sighted users, but it's a <p>, not a
            heading — this screen was the only one in the app with no h1 at
            all (axe: page-has-heading-one). sr-only keeps the visual design
            untouched while giving screen reader users a real landmark. */}
        <h1 ref={summaryHeadingRef} tabIndex={-1} className="sr-only">
          Session complete
        </h1>
        <Kicker index="02">Session complete</Kicker>

        <div className="flex flex-col items-center gap-3">
          <ScoreRing score={averageScore} size={128} />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            Average score
          </p>
        </div>

        <p className="w-full max-w-md break-words text-lg leading-relaxed text-ink">{summary}</p>

        <ul className="flex w-full flex-col gap-2 rounded-md border border-line bg-paper-raised p-4 text-left">
          {session.questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-center justify-between gap-4 border-t border-line py-2 first:border-t-0 first:pt-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{question.question}</span>
              <span className="shrink-0 font-mono text-xs text-ink">
                {feedbacks[index]?.score ?? "—"}
                <span className="text-ink-soft">/10</span>
              </span>
            </li>
          ))}
        </ul>

        <p aria-live="polite" className="font-mono text-xs text-ink-soft">
          {saveStatus === "saving" && "Saving your results…"}
          {saveStatus === "saved" && "Results saved to your history."}
          {saveStatus === "error" &&
            "Couldn't save your results — they won't appear in your history, but nothing else is affected."}
        </p>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/history")}
            className="sm:w-auto"
          >
            View in history
          </Button>
          <Button type="button" onClick={() => router.push("/")} className="sm:w-auto">
            Start new session
          </Button>
        </div>
      </main>
    );
  }

  const currentQuestion = session.questions[currentIndex];
  const isLastQuestion = currentIndex === session.questions.length - 1;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-paper px-6 pb-16 sm:px-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Kicker>
          Question {currentIndex + 1} of {session.questions.length}
        </Kicker>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          {currentQuestion.type} · {difficultyLabel(session.difficulty)}
        </span>
      </div>

      <h1
        ref={questionHeadingRef}
        tabIndex={-1}
        className="w-full max-w-2xl break-words text-center font-display text-3xl leading-snug text-ink sm:text-4xl"
      >
        {currentQuestion.question}
      </h1>

      <div className="w-full max-w-2xl">
        {evalStatus === "success" && feedback ? (
          <FeedbackDisplay
            feedback={feedback}
            question={currentQuestion.question}
            isLastQuestion={isLastQuestion}
            onNext={handleNext}
            onRetry={handleRetry}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <AnswerInput
              value={answer}
              onChange={setAnswer}
              onSubmit={submitAnswer}
              submitting={evalStatus === "loading"}
            />
            {evalStatus === "error" && (
              <div
                aria-live="polite"
                className="flex flex-col gap-3 rounded-sm border border-line bg-paper-raised p-4 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm leading-relaxed text-ink">
                  <span className="font-medium">Couldn&apos;t evaluate your answer.</span>{" "}
                  <span className="text-ink-soft">{evalError}</span>
                </p>
                <Button type="button" onClick={() => void submitAnswer()} className="sm:w-auto">
                  Try again
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
