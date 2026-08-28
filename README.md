# InterviewIQ

An AI-powered interview practice coach that turns any job description into a tailored mock interview, then scores your answers with structured, actionable feedback.

**Live demo:** [ai-interview-psi-blush.vercel.app](https://ai-interview-psi-blush.vercel.app/)
**Repository:** [github.com/AmnaKhalil96/Ai-interview](https://github.com/AmnaKhalil96/Ai-interview)

## What it does

Job seekers rarely get to rehearse against questions actually shaped by the role they're applying for. InterviewIQ solves that: paste a job posting, pick a difficulty level, and it generates five interview questions (a mix of behavioral and technical) built specifically for that posting. Answer each one by typing or speaking, and get back a score, concrete strengths and gaps, and a rewritten stronger answer — all backed by a real account so your practice history and score trends persist across sessions and devices.

## Features

- **AI-generated, role-specific questions** — 5 questions per session (3 behavioral, 2 technical), calibrated to entry/mid/senior difficulty, generated from the actual pasted job description rather than a generic question bank
- **Text or voice answers** — type your answer, or use the browser's built-in speech recognition to talk through it; voice input appends live to whatever's already typed
- **Structured AI evaluation** — every answer is scored 1–10 with a rubric that branches by question type: the **STAR method** (Situation, Task, Action, Result) for behavioral answers, **correctness / clarity / completeness** for technical ones — plus 2–4 specific strengths, 2–4 specific gaps, and a rewritten improved answer
- **Retry a question** — re-attempt any question before moving on, with no penalty and no stale state left behind
- **Session summary** — an average score ring, a one-line takeaway, and a per-question score breakdown the moment you finish
- **Copy feedback** — copy any question's full feedback (score, strengths, gaps, improved answer) to the clipboard as plain text, ready to paste into notes or an email
- **Authentication** — email/password and Google sign-in via Firebase Auth
- **Persistent history with score trends** — every finished session is saved to your account; the history page lists past sessions with expandable feedback and a score-trend chart across sessions

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS |
| Auth & database | Firebase Authentication, Cloud Firestore |
| AI | Google Gemini API (`@google/generative-ai`) |
| Unit/component testing | Vitest, React Testing Library |
| End-to-end testing | Cypress, cypress-axe |
| Auditing | Lighthouse (programmatic), axe-core |

## Setup & run locally

**Prerequisites:** Node.js 18.17 or later, npm, a [Firebase](https://console.firebase.google.com) project, and a [Google AI Studio](https://aistudio.google.com/apikey) API key.

```bash
git clone https://github.com/AmnaKhalil96/Ai-interview.git
cd Ai-interview
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` with the following:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → General → Your apps → SDK setup and configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same as above |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) — server-side only, never exposed to the browser |

In the Firebase Console, also:
1. **Authentication → Sign-in method** — enable **Email/Password** and **Google**.
2. **Firestore Database** — create a database, then publish the rules in [`firestore.rules`](firestore.rules) (Firestore Database → Rules → paste → Publish). They restrict the `sessions` collection to userId-scoped read/create and disable update/delete entirely — the app already scopes every query the same way client-side, but these rules are what actually enforce it server-side.

Then run it:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture overview

```
src/
  app/                    Routes (Next.js App Router)
    page.tsx              Landing page (server component + JobDescriptionForm island)
    login/page.tsx         Email/password + Google sign-in
    session/page.tsx       One question at a time: answer, evaluate, retry, advance, summarize
    history/page.tsx       Past sessions, expandable feedback, score trend chart
    api/
      generate-questions/  POST route: validates input, calls lib/ai/generateQuestions
      evaluate-answer/     POST route: validates input, calls lib/ai/evaluateAnswer

  components/             Domain-specific components (know about interviews/auth)
    ui/                    Generic, reusable primitives (Button, TextArea, Kicker, ScoreRing, ...)

  lib/
    ai/                    Gemini integration — see below
    firebase.ts            Single Firebase app/Auth/Firestore init point
    auth.ts                signUp / signIn / signInWithGoogle / signOutUser + friendly error mapping
    sessions.ts             Firestore reads/writes for the `sessions` collection
    sessionSummary.ts       Client-side average score + one-line session summary
    practiceSession.ts      sessionStorage handoff of generated questions (landing → session page)
    difficulty.ts           Shared Difficulty type, labels, and validation guard
```

**The `lib/ai/` isolation pattern.** `generateQuestions.ts` and `evaluateAnswer.ts` each own *everything* Gemini-specific — the SDK, the model name, the prompt, the response schema, and the raw-text parsing/validation. Nothing outside these two files imports `@google/generative-ai`; the rest of the app only ever sees a typed `Question`/`Feedback` result or an `AIGenerationError` (`lib/ai/errors.ts`) with a `kind` of `api_error`, `invalid_response`, or `invalid_input`. Swapping providers later means rewriting the inside of these two files — the API routes, the pages, and the types they return don't change.

**Auth architecture.** `AuthProvider` (`components/AuthProvider.tsx`) wraps Firebase's `onAuthStateChanged` in a React context and exposes a single `useAuth()` hook returning `{ user, loading }`. Every page that needs auth (`session`, `history`, the practice form on the landing page) reads this hook directly rather than calling Firebase itself, and every Firestore query is issued only after `user` resolves, scoped by `where("userId", "==", user.uid)` — never fetched or shown before authentication succeeds.

**Firestore schema.** One collection, `sessions`. Each document is one completed practice session:

```ts
{
  userId: string;
  jobDescription: string;
  difficulty: "entry" | "mid" | "senior";
  questions: { id: string; type: "behavioral" | "technical"; question: string }[];
  answers: string[];
  feedbacks: { score: number; strengths: string[]; gaps: string[]; improvedAnswer: string }[];
  averageScore: number;
  createdAt: Timestamp; // serverTimestamp()
}
```

History is fetched with a single equality filter on `userId` (sorted by date in JS afterward, not in the query) specifically to avoid requiring a manually-provisioned Firestore composite index for a tiny per-user dataset.

Server-side enforcement of that same `userId` scoping lives in [`firestore.rules`](firestore.rules) — a signed-in user may only read or create `sessions` documents where the document's `userId` matches their own `request.auth.uid`, and updates/deletes are disabled entirely (sessions are write-once).

## AI integration

**Model:** Google Gemini, via the `@google/generative-ai` SDK (model name is a single constant in each `lib/ai/*.ts` file, so upgrading models is a one-line change).

There are exactly **two** distinct AI calls in the app:

1. **`generateQuestions`** — one call does double duty: it first judges whether the pasted text is actually a plausible job description, and if so, writes 5 questions (3 behavioral, 2 technical) tailored to it and to the chosen difficulty. Validity-checking and question-writing are folded into a *single* call rather than a separate "is this valid?" call beforehand — a second call would double the latency and cost of every request just to filter a rare case.
2. **`evaluateAnswer`** — scores one submitted answer at a time: an integer 1–10, 2–4 strengths, 2–4 gaps, and a rewritten improved answer.

**Why structured JSON output.** Both calls set `responseMimeType: "application/json"` and pass an explicit `responseSchema` (Gemini's structured-output feature) instead of parsing free-form text. That's still treated as a floor, not a guarantee: both modules strip stray code fences defensively, then validate every field's type and shape before trusting it — a model returning syntactically valid JSON in the wrong shape raises a typed `AIGenerationError` instead of silently propagating bad data or crashing.

**Prompt design philosophy.** The evaluation rubric branches by question type rather than using one generic "was this good?" prompt: behavioral answers are graded against the **STAR method**, explicitly naming which of Situation/Task/Action/Result is missing or underdeveloped; technical answers are graded on **correctness, clarity, and completeness**. Grading both against a single generic rubric would blur that distinction and produce vaguer feedback.

Note: the session summary screen's one-line takeaway is **not** a third AI call — see Limitations below.

## Testing

```bash
npm run test           # Vitest — unit/component tests
npm run test:coverage  # Vitest with a coverage report
npm run test:e2e       # Cypress — full end-to-end suite
npm run test:a11y      # Cypress — accessibility spec only
```

**Current coverage** (`npm run test:coverage`): 136 tests across 16 files, all passing — **71% statements / 74% branches / 74% functions / 72% lines** overall. Coverage isn't evenly spread on purpose: `lib/` (the AI response parsing/validation, auth error mapping, session math, Firestore access) sits around **93%** statements, since that's where the logic worth unit-testing in isolation lives. A handful of components (`AuthProvider`, `JobDescriptionForm`, `SiteHeader`, `ScoreTrendChart`) show low or 0% in the Vitest report specifically because they're exercised end-to-end by the Cypress suite instead — real sign-up, real Firestore, mocked Gemini routes — not because they're untested.

**What's covered:**
- **Vitest** — both Gemini call sites' happy paths and malformed-response edge cases, auth error-message mapping, session-summary math (including tie-breaking), difficulty validation, garbage-input detection, and component tests for `Button`, `LoginForm`, `AnswerInput`, `ScoreRing`, `CopyFeedbackButton`, `DifficultySelector`, and `FeedbackDisplay`.
- **Cypress** — three full specs: the happy-path practice flow (real sign-up → generate questions → answer all 5, including one retry → session summary → appears in history), the evaluation-error-and-recovery path, and a full accessibility audit across every page and major UI state.

## Known limitations & future improvements

- **Gemini free-tier rate limits.** There's no in-app rate limiting, backoff, or request queueing — a burst of requests can hit the provider's own quota, surfaced to the user as a generic "AI request failed, try again" message rather than a specific rate-limit notice.
- **Session summary is aggregated client-side, not a dedicated AI call.** The one-line takeaway on the summary screen reuses the best-scoring answer's top strength and the worst-scoring answer's top gap from feedback Gemini already returned, rather than firing a sixth AI request. This is a deliberate reliability/cost trade-off (documented in `lib/sessionSummary.ts`), but it means the summary can't say anything more insightful than what the per-question feedback already said.
- **Single AI provider.** Only Gemini is wired in today. The `lib/ai/` isolation pattern (above) was built specifically so adding or swapping providers means editing `generateQuestions.ts`/`evaluateAnswer.ts` internals, not touching the API routes, pages, or types.
- **`/history` is client-rendered.** There's no server-side session cookie, so the history page can't render real data until Firebase Auth resolves client-side and a Firestore query completes — see `docs/lighthouse-audit.md` for how this was mitigated (a properly-sized loading skeleton) without weakening the auth model.
- **Firestore rules must be published manually.** [`firestore.rules`](firestore.rules) is checked into this repo, but Firestore doesn't read a repo file automatically — it has to be pasted into the Firebase Console (or deployed via the Firebase CLI) per the Setup section above, and it's possible for the console's live rules to drift from the file if someone edits one without the other.

## Accessibility & performance

- **Accessibility:** audited with axe-core's full rule set (every WCAG 2.0/2.1 A + AA rule, plus best-practice rules) against the production build, across every page and major UI state — **0 violations**. See [`docs/accessibility-audit.md`](docs/accessibility-audit.md) for what was found and fixed (heading order, missing headings, focus management on in-page transitions).
- **Performance:** audited with Lighthouse against a production build. Final scores — Landing: **90** mobile / **100** desktop; History (authenticated): **92** mobile / **100** desktop; Accessibility, Best Practices, and SEO are a clean **100** across every page and form factor. See [`docs/lighthouse-audit.md`](docs/lighthouse-audit.md) for the full before/after breakdown, including the font and client-side-auth-loading fixes that got history-mobile from 50 to 92.
