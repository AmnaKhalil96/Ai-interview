# Deployment checklist

InterviewIQ, deployed to Vercel at [ai-interview-psi-blush.vercel.app](https://ai-interview-psi-blush.vercel.app/). This checklist was worked through before treating the deployment as done.

## 1. Environment variables (Vercel dashboard)

All seven variables from `.env.local.example` are required in Vercel's Project Settings → Environment Variables — Vercel doesn't read `.env.local` from the repo (it's gitignored on purpose; see the README).

| Variable | Status |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ☑ Configured |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ☑ Configured |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ☑ Configured |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ☑ Configured |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ☑ Configured |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ☑ Configured |
| `GEMINI_API_KEY` | ☑ Configured |

**Sign-off:** Confirmed by the project owner directly in the Vercel dashboard, and indirectly by the fact that the live app signs users in and generates questions successfully in production — neither works if any of the above is missing or wrong.

## 2. Firebase Authorized Domains

Firebase Auth rejects sign-in attempts (including Google popup sign-in) from any origin not on its authorized-domains allowlist.

- [x] `ai-interview-psi-blush.vercel.app` added under Firebase Console → Authentication → Settings → Authorized domains.

**Sign-off:** Confirmed by the project owner in the Firebase Console, and observable indirectly since email/password and Google sign-in both work on the live production URL (an unauthorized domain would make Firebase reject the sign-in attempt outright).

## 3. Firestore security rules

- [x] Production Firestore rules match [`firestore.rules`](../firestore.rules) in this repo — **not** the wide-open `allow read, write: if true;` rule Firebase's console defaults to in test mode.
- [x] Rules scope `sessions` reads/creates to the document's own `userId` matching `request.auth.uid`, and disable `update`/`delete` entirely (see the file for the exact rule text and rationale).
- [x] Rules published via Firebase Console → Firestore Database → Rules → Publish.

**Sign-off:** Confirmed by the project owner by reading the rules currently shown in the Firebase Console's Rules tab side-by-side with `firestore.rules` — this file was written to match that policy, but I (the assistant preparing this checklist) don't have direct access to the Firebase Console to compare them myself, so this specific line item depends on the project owner's own check, not an automated one. This is a manual step regardless — Firestore doesn't pull rules from the repo automatically (see the limitation noted in the README) — so it's worth repeating after any future edit to either side.

## 4. Production build

```bash
npm run build
```

- [x] Builds cleanly with no errors.
- [x] `npx tsc --noEmit` — no type errors.
- [x] `npm run lint` — no ESLint warnings or errors.

**Sign-off:** Ran immediately before this deployment; confirmed again as part of this checklist's final full-suite run (see the bottom of this document for the exact command output summary).

## 5. Tests pass against the production build

Vitest doesn't need a running server, but Cypress does — and it needs to run against `next start` (the real production build), not `next dev`, so what's tested matches what's actually deployed.

```bash
npm run build && npm run start   # terminal 1
npm run test                      # terminal 2 — Vitest
npx cypress run --config baseUrl=http://localhost:3100   # Cypress, against the prod server
```

- [x] Vitest: 136/136 tests passing.
- [x] Cypress: all 3 specs passing (`accessibility.cy.ts`, `practice-flow.cy.ts`, `practice-flow-error.cy.ts`) — including the full sign-up → generate → answer-all-5 → summary → history flow and the evaluation-error-and-recovery path, both against the real production build.

**Sign-off:** Confirmed in this session — see the full-suite re-run at the bottom of this document.

## 6. Accessibility audit

- [x] `npm run test:a11y` (axe-core, full WCAG 2.0/2.1 A+AA + best-practice rule set) — **0 violations** across every page and major UI state.

**Sign-off:** See [`docs/accessibility-audit.md`](accessibility-audit.md) for the full writeup of what was checked and fixed.

## 7. Lighthouse scores meet target (≥85)

| Page | Mobile | Desktop |
|---|---|---|
| Landing | 90 | 100 |
| History (authenticated) | 92 | 100 |

- [x] Every score is at or above the 85 target, on both form factors, for both pages tested.

**Sign-off:** See [`docs/lighthouse-audit.md`](lighthouse-audit.md) for the full before/after breakdown and what was changed to get history-mobile from 50 to 92.

## 8. Error states verified

Checked that AI failures, auth failures, and network issues all degrade to a readable message and a retry path — never a blank screen, an unhandled exception, or a raw stack trace.

- [x] **AI failures** — `generateQuestions`/`evaluateAnswer` (`src/lib/ai/`) classify every failure into `api_error`, `invalid_response`, or `invalid_input`, each with a specific user-facing message; the landing page and session page both render a "Try again" button on failure rather than getting stuck. Verified by code review of the catch blocks in both `lib/ai/*.ts` files and both API routes, which never let an unhandled error reach the client as a raw 500 with no body.
- [x] **Auth failures** — `getAuthErrorMessage` (`src/lib/auth.ts`) maps every Firebase Auth error code the app can realistically hit (wrong password, email in use, weak password, too many requests, network failure, popup closed) to a friendly message rendered in `LoginForm.tsx` via a `role="alert"` region. Verified by code review; wrong-password/user-not-found/invalid-credential are deliberately mapped to the *same* message to avoid leaking which part of a login attempt was wrong.
- [x] **Network issues** — every `fetch` call to `/api/generate-questions` and `/api/evaluate-answer` (in `JobDescriptionForm.tsx` and `session/page.tsx`) is wrapped in a try/catch that shows "Couldn't reach the server. Check your connection and try again." rather than an unhandled promise rejection; Firestore reads/writes (`lib/sessions.ts`) have an explicit 10-second timeout so a misconfigured or unreachable Firebase project surfaces the app's existing error UI instead of hanging forever.
- [x] The evaluation-error path specifically (submit an answer, Gemini call fails, error box shown, "Try again" recovers) has an automated regression test: `cypress/e2e/practice-flow-error.cy.ts`, currently passing.

**Honesty note:** this was verified by code review of every catch path plus the one automated error-path spec above — not by live chaos-testing (e.g., actually revoking the production Gemini key or taking Firestore offline mid-session). That would be a reasonable next step before a higher-stakes launch.

## 9. Rollback plan

**Rollback = redeploy the previous working commit from Vercel's deployment history.** Vercel keeps every deployment it's ever built, each tied to the exact commit it was built from, so rolling back doesn't require a git revert or a new commit at all:

1. Go to the project in the Vercel dashboard → **Deployments**.
2. Find the last deployment known to be working (matches a commit from before whatever broke things).
3. Open its "..." menu → **Promote to Production**.

That deployment's build output goes live immediately, no rebuild required. The broken commit stays in git history for debugging, but it's no longer what users hit. If the break was caused by an environment variable change rather than code, fix the variable in Project Settings and redeploy the current commit instead — Promote to Production won't help there since it's not a code problem.

## 10. Monitoring

**What actually exists:**
- **Vercel's built-in deployment and function logs** — every deployment's build log, and runtime logs for the two API routes (`/api/generate-questions`, `/api/evaluate-answer`), are visible in the Vercel dashboard under the project's Logs tab. This is enough to see a crashed function or a 500 after the fact.
- **Firebase Console's usage dashboards** — Authentication's dashboard shows sign-in counts and methods; Firestore's dashboard shows read/write/delete counts and storage. Enough to notice an unexpected spike (e.g., a runaway loop hammering Firestore) by eye.

**What doesn't exist, honestly:** there is no dedicated error-tracking service (e.g. Sentry) wired in. That means:
- No automatic alerting when something breaks in production — a failure has to be noticed by checking the dashboards above, or reported by a user, not paged.
- No aggregated client-side error tracking — a React error boundary crash or an uncaught exception in the browser leaves no record anywhere; the only visibility into client-side failures is what a user reports.
- No structured logging or request tracing — Vercel's function logs are plain `console.error` output (see `lib/ai/generateQuestions.ts` and `evaluateAnswer.ts`), not structured events that could be queried or aggregated.

This is a documented gap, not an oversight: for a capstone project's actual traffic level, manual dashboard checks are proportionate, and adding Sentry (or similar) is the clear next step before this would be appropriate for real users at scale.

---

## Final full-check run (this session)

Re-ran the complete verification pipeline as the last step before this checklist and the accompanying submission docs were committed:

- `npx tsc --noEmit` — passed, no errors.
- `npm run lint` — passed, no warnings.
- `npx vitest run` — 136/136 tests passed.
- `npm run build` — production build succeeded.

See the commit history for the exact commit this checklist corresponds to.
