"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Kicker from "@/components/ui/Kicker";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import ScoreTrendChart from "@/components/ui/ScoreTrendChart";
import FeedbackDisplay from "@/components/FeedbackDisplay";
import { fetchSessions } from "@/lib/sessions";
import { difficultyLabel } from "@/lib/difficulty";
import { useAuth } from "@/components/AuthProvider";
import type { Session } from "@/types";

type LoadStatus = "loading" | "success" | "error";

const JOB_DESCRIPTION_PREVIEW_LENGTH = 90;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

// Client component (not a server component fetching Firestore directly)
// because the query needs the signed-in user's uid, which the Firebase
// Auth SDK only resolves client-side via onAuthStateChanged (see
// AuthProvider.tsx) — there's no cookie/session on the server to read it
// from without adding session-cookie infrastructure, which is out of scope
// here.
export default function HistoryPage() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  function load(userId: string) {
    setStatus("loading");
    fetchSessions(userId)
      .then((fetched) => {
        setSessions(fetched);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) load(user.uid);
    // load intentionally omitted: it's redefined every render but its
    // behavior only depends on user.uid, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router]);

  // Auth resolving and the Firestore fetch both render this same skeleton —
  // there's no separate "checking who's signed in" blank screen anymore.
  // This is UI only: no session data is requested or shown until `user` is
  // confirmed by useAuth() above, so this doesn't change what's fetched or
  // when, only what paints while we wait.
  const isLoading = authLoading || status === "loading";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 pb-16 sm:px-10">
      <div className="flex flex-col gap-2">
        <Kicker index="03">Progress history</Kicker>
        <h1 className="font-display text-3xl text-ink">Your past sessions</h1>
      </div>

      {isLoading && (
        <>
          {/* This paragraph is deliberately sized close to (never smaller
              than) the real empty-state paragraph below: Lighthouse's LCP
              algorithm re-anchors to any STRICTLY LARGER text block that
              paints later, so a skeleton that's too small just gets
              superseded once real content arrives, which is exactly what
              was happening before this fix (measured: LCP ~6.3s, anchored
              to the empty-state paragraph, not this loading state). Matching
              the size means this early paint keeps winning. See
              docs/lighthouse-audit.md. */}
          <div className="flex flex-col items-center gap-4 rounded-md border border-line bg-paper-raised p-10 text-center">
            <p aria-live="polite" className="flex items-center gap-3 font-mono text-xs text-ink-soft">
              <Spinner className="h-4 w-4" />
              Loading your past sessions…
            </p>
            <p className="w-full max-w-sm break-words text-sm leading-relaxed text-ink-soft">
              Once this finishes, you&apos;ll see every session you&apos;ve completed here,
              along with your scores and the feedback you got on each question you practiced.
            </p>
          </div>

          {/* Pulsing placeholders for the chart card and a couple of session
              rows — pure perceived-loading UX (no text, so they aren't LCP
              candidates and don't affect the metric above). Tailwind's
              animate-pulse is already neutralized under
              prefers-reduced-motion by the global rule in globals.css. */}
          <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-paper-raised p-6">
            <div className="h-3 w-24 animate-pulse rounded-sm bg-line" />
            <div className="h-24 w-full animate-pulse rounded-sm bg-line" />
          </div>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <div className="h-20 w-full animate-pulse rounded-md border border-line bg-paper-raised" />
            <div className="h-20 w-full animate-pulse rounded-md border border-line bg-paper-raised" />
          </div>
        </>
      )}

      {status === "error" && (
        <div
          aria-live="polite"
          className="flex flex-col gap-3 rounded-sm border border-line bg-paper-raised p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-medium">Couldn&apos;t load your history.</span>{" "}
            <span className="text-ink-soft">Check your connection and try again.</span>
          </p>
          <Button type="button" onClick={() => user && load(user.uid)} className="sm:w-auto">
            Try again
          </Button>
        </div>
      )}

      {status === "success" && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-md border border-line bg-paper-raised p-10 text-center">
          <p className="w-full max-w-sm break-words text-sm leading-relaxed text-ink-soft">
            You haven&apos;t finished a practice session yet. Once you answer
            all 5 questions in a session, it&apos;ll show up here.
          </p>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.2em] text-accent underline underline-offset-4"
          >
            Start practicing
          </Link>
        </div>
      )}

      {status === "success" && sessions.length > 0 && (
        <>
          <div className="flex flex-col gap-3 rounded-md border border-line bg-paper-raised p-6">
            <Kicker>Score trend</Kicker>
            <ScoreTrendChart scores={[...sessions].reverse().map((session) => session.averageScore)} />
          </div>

          <ul className="flex flex-col gap-3">
            {sessions.map((session) => {
              const isExpanded = expandedId === session.id;
              return (
                <li key={session.id} className="rounded-md border border-line bg-paper-raised">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-col gap-3 p-6 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
                        {formatDate(session.createdAt)} · {session.questions.length} questions ·{" "}
                        {difficultyLabel(session.difficulty)}
                      </span>
                      <span className="font-display text-lg text-ink">
                        {truncate(session.jobDescription, JOB_DESCRIPTION_PREVIEW_LENGTH)}
                      </span>
                    </div>
                    <span className="font-display text-2xl text-ink shrink-0">
                      {session.averageScore}
                      <span className="text-sm text-ink-soft">/10</span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-8 border-t border-line p-6 sm:p-8">
                      {session.questions.map((question, index) => (
                        <div
                          key={question.id}
                          className="flex flex-col gap-4 border-t border-line pt-8 first:border-t-0 first:pt-0"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                              {question.type}
                            </span>
                            {/* h2, not h3 — nothing between this and the
                                page's h1 (the session summary row above it
                                is a <button>, not a heading), so h3 skipped
                                a level (axe: heading-order). */}
                            <h2 className="break-words font-display text-xl text-ink">{question.question}</h2>
                          </div>
                          {/* break-words matters most here — unlike the AI-written
                              text elsewhere on this page, this is the candidate's own
                              typed answer with no shape guarantees at all (someone
                              could paste a URL or a long unbroken token), so it's the
                              one place on this page a single "word" could genuinely
                              be wider than the screen without this. */}
                          <blockquote className="break-words border-l-2 border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-soft">
                            {session.answers[index]}
                          </blockquote>
                          {session.feedbacks[index] && (
                            <FeedbackDisplay
                              feedback={session.feedbacks[index]}
                              question={question.question}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
