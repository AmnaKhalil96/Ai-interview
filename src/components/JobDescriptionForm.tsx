"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Kicker from "@/components/ui/Kicker";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import DifficultySelector from "@/components/DifficultySelector";
import { savePracticeSession } from "@/lib/practiceSession";
import { looksLikeRepeatedGarbage } from "@/lib/looksLikeRepeatedGarbage";
import { DEFAULT_DIFFICULTY } from "@/lib/difficulty";
import { useAuth } from "@/components/AuthProvider";
import type { Difficulty, Question } from "@/types";

// This lives in components/ (not components/ui) because it knows about the
// interview-practice domain: it owns the job-description text state, talks
// to the question-generation API, and decides where "Start Practice"
// navigates to. The ui/ primitives it's built from stay domain-agnostic on
// purpose — that split is what lets ui/ get reused later without dragging
// this page's logic along with it.
const MIN_LENGTH = 40;
const MAX_LENGTH = 3000;

type Status = "idle" | "loading" | "error";

export default function JobDescriptionForm() {
  const [jobDescription, setJobDescription] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const trimmed = jobDescription.trim();
  const meetsLength = trimmed.length >= MIN_LENGTH && jobDescription.length <= MAX_LENGTH;
  // Cheap, mechanical pre-check only — catches a mashed/repeated string
  // for free before spending an API call on it. It deliberately can't
  // tell a real job description from unrelated-but-coherent text (a
  // recipe, a story); that judgment call is what the AI-based check in
  // generateQuestions.ts is for.
  const isObviousGarbage = meetsLength && looksLikeRepeatedGarbage(trimmed);
  const isReady = meetsLength && !isObviousGarbage;

  async function generate() {
    setStatus("loading");
    setErrorMessage(null);
    setErrorKind(null);

    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jobDescription.trim(), difficulty }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Something went wrong generating your questions.";
        const kind =
          data && typeof data === "object" && typeof (data as { kind?: unknown }).kind === "string"
            ? (data as { kind: string }).kind
            : null;
        setStatus("error");
        setErrorMessage(message);
        setErrorKind(kind);
        return;
      }

      const { questions } = data as { questions: Question[] };
      savePracticeSession({ jobDescription: jobDescription.trim(), difficulty, questions });
      router.push("/session");
      // Deliberately not resetting status back to "idle" on success: this
      // component is about to be unmounted by the navigation, and leaving
      // the button in its loading state avoids a one-frame flash back to
      // "Start practice" right before the page changes.
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
      setErrorKind(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReady || status === "loading") return;
    void generate();
  }

  // Gated here rather than with a route-level redirect: this is the
  // landing page, and a visitor who isn't signed in yet should still see
  // the page and understand what it's for — just with an explanation of
  // why they need an account before they can start, not a silent bounce
  // to /login.
  if (!authLoading && !user) {
    return (
      <div className="animate-fade-up [animation-delay:200ms] flex flex-col items-center gap-4 rounded-md border border-line bg-paper-raised p-10 text-center shadow-[0_1px_0_0_rgb(var(--line))] sm:p-12">
        <Kicker index="01">Job description</Kicker>
        <p className="w-full max-w-sm break-words text-sm leading-relaxed text-ink-soft">
          Sign in to start practicing — your questions, answers, and feedback
          are saved to your account so you can track your progress over time.
        </p>
        <Button type="button" onClick={() => router.push("/login")} className="sm:w-auto">
          Sign in to start practicing
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-up [animation-delay:200ms] flex flex-col gap-5 rounded-md border border-line bg-paper-raised p-6 shadow-[0_1px_0_0_rgb(var(--line))] sm:p-8"
    >
      <div className="flex items-baseline justify-between">
        <Kicker index="01">Job description</Kicker>
        <span className="font-mono text-xs text-ink-soft">
          {jobDescription.trim().length} chars
        </span>
      </div>

      <label htmlFor="job-description" className="sr-only">
        Paste the job description you&apos;re preparing for
      </label>
      <TextArea
        id="job-description"
        name="job-description"
        placeholder="Paste the job description you're preparing for — responsibilities, required skills, seniority level, anything that shapes what you'll be asked…"
        value={jobDescription}
        onChange={(event) => setJobDescription(event.target.value)}
        rows={11}
        minLength={MIN_LENGTH}
        maxLength={MAX_LENGTH}
        disabled={status === "loading"}
        required
      />

      <DifficultySelector value={difficulty} onChange={setDifficulty} disabled={status === "loading"} />

      {status === "error" ? (
        <div className="flex flex-col gap-3 rounded-sm border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-medium">
              {errorKind === "invalid_input" ? "Not a job description." : "Couldn't generate questions."}
            </span>{" "}
            <span className="text-ink-soft">{errorMessage}</span>
          </p>
          <Button type="button" onClick={() => void generate()} className="sm:w-auto">
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-ink-soft">
            {status === "loading"
              ? "Reading the role and drafting questions tailored to it…"
              : !meetsLength
                ? `Paste at least ${MIN_LENGTH} characters to continue.`
                : isObviousGarbage
                  ? "This looks like repeated text, not a job description."
                  : "Tailored behavioral + technical questions, generated from this text."}
          </p>
          <Button
            type="submit"
            disabled={!isReady}
            loading={status === "loading"}
            className="sm:w-auto"
          >
            {status === "loading" ? "Generating questions" : "Start practice"}
          </Button>
        </div>
      )}
    </form>
  );
}
