# Accessibility audit

**Tool:** [axe-core](https://github.com/dequelabs/axe-core) 4.13, run via [cypress-axe](https://github.com/component-driven/cypress-axe) against a real Chromium browser (Cypress's Electron runner) loading the actual production build — not a static/offline check.

**Scope:** every page and every major UI state — landing (signed out, signed in empty, signed in filled), login (log in mode, sign up mode, validation error shown), session (question view, feedback view, after retry, summary screen), history (list view, expanded with feedback). Rule set: axe's **full** rule set — every WCAG 2.0/2.1 A and AA rule, plus axe's "best-practice" rules (heading order, page-has-heading-one, etc.), which is a strict superset of "WCAG 2.1 AA" and is what caught two of the three real issues below.

**How to re-run it yourself:**
```
npm run build && npm run start     # terminal 1, production build on :3100
npm run test:a11y                  # terminal 2
```
The spec is permanent: `cypress/e2e/accessibility.cy.ts`. It writes the full violation detail (if any) to `cypress/a11y-results.json` and prints the same to the terminal.

## Result: 0 violations (after fixes)

The final run of `npm run test:a11y` passes with the full rule set against every page/state listed above. `cypress/a11y-results.json` is `[]`.

## What was found, and what was fixed

### 1. Heading order skipped a level (moderate) — FIXED
`IndexItem` (the numbered "how it works" list on the landing page) and the per-question heading in the history detail view both used `<h3>` immediately after the page's `<h1>`, with nothing at `<h2>` in between. Screen reader users navigate by heading level, and a skipped level makes the page's structure look broken or incomplete even though nothing is visually wrong.
- `src/components/ui/IndexItem.tsx`: `<h3>` → `<h2>`.
- `src/app/history/page.tsx`: the per-question `<h3>` → `<h2>`.

### 2. Summary screen had no heading at all (moderate) — FIXED
Every other screen in the app has an `<h1>`, but the "session complete" summary screen only had a `Kicker` (a styled `<p>`) for its title — a screen reader user landing there gets no heading to orient by. Added a visually-hidden `<h1>` (`sr-only`) with the same text the Kicker already shows sighted users, so the visual design is untouched.
- `src/app/session/page.tsx`.

### 3. "Serious" color-contrast violation — investigated, confirmed not a real defect
The first automated run flagged the landing page's "Sign in to start practicing" button at a 2.17:1 contrast ratio (needs 4.5:1). Investigating the exact reported computed colors (foreground `#0b0e14`, background `#484a4d`) showed the background didn't match the button's real style (`bg-ink` = `#EDEDE8`, a light near-white) — it closely matched `ink` blended at ~30% opacity over the dark page background. That's this app's entrance animation: the landing page's content fades in from `opacity: 0` over ~900ms (`animate-fade-up`), and the very first automated check ran fast enough to catch the button mid-fade, when its effective on-screen contrast really was that low for a fraction of a second.

This is a real thing the tool measured, but not a persistent barrier — no one can meaningfully read or click a button in the first ~100–300ms of a page load anyway, and users with `prefers-reduced-motion` already skip the animation entirely (see the existing media query in `globals.css`). Re-running the check after waiting for the animation to finish (`cy.wait(1000)`, now permanently in the spec, with a comment explaining why) confirms the settled page has no contrast issue: it's the same `bg-ink`/`text-paper` pair used on every other primary button in the app, verified at ~14.7:1 contrast — nowhere close to the 4.5:1 minimum. No code change was needed here; the fix was to test the way a human auditor actually would (after the page settles), which is now the permanent, correct methodology in the spec.

## Manually double-checked (per the task's specific callouts)

These were already implemented correctly in earlier work on this app, and axe's automated pass corroborates that — verified by direct code reading, not just trusting the tool:

- **Mic button states** (`AnswerInput.tsx`): real `<button>` with a dynamic `aria-label` ("Start voice input" / "Stop recording, listening now"), `aria-pressed` reflecting listening state, and a live-region status paragraph (`aria-live="polite"`) for "Listening…", permission-denied, and unsupported-browser messages.
- **Score ring** (`ScoreRing.tsx`): `role="img"` with `aria-label="Score: N out of 10"` on the wrapping element; the visual number inside is `aria-hidden` so it isn't announced twice.
- **Score trend chart** (`ScoreTrendChart.tsx`): the SVG itself is `aria-hidden`; a `sr-only` sentence gives the actual accessible content ("Score trend across N sessions, oldest to newest: …").
- **Difficulty selector**: real `<input type="radio">` elements (visually hidden, not `aria-hidden`) inside a `<fieldset>`/`<legend>`, giving native arrow-key navigation and screen-reader group semantics for free.
- **Form labels**: every text input has a real `<label htmlFor>` (LoginForm) or an equivalent `aria-label`/visually-hidden label (the job-description and answer textareas).
- **Copy-feedback live confirmation**: the visible button label changes to "Copied!", and a separate `role="status" aria-live="polite"` region announces "Feedback copied to clipboard." for screen readers (a button's own text changing isn't reliably announced on its own).

## Focus management (not detectable by axe — verified by hand and by test)

axe inspects a static DOM snapshot; it cannot see whether focus moves sensibly across an interaction. This app has three in-page transitions with no URL change (so none of the browser's normal navigate-and-refocus behavior applies): advancing to the next question, retrying a question, and finishing the session. Before this audit, none of them moved focus — clicking "Next question" unmounted the button under a keyboard/screen-reader user's cursor and silently dropped focus onto `<body>`, with no indication anything had happened or where they now were.

**Fix:** `src/app/session/page.tsx` now tracks a `questionViewKey` bumped on every Next/Retry, and a separate flag for reaching the summary screen; two `useEffect`s move focus to the relevant heading (`tabIndex={-1}` added to make a heading programmatically focusable without adding it to the normal tab order) whenever either changes. Verified with real assertions in `cypress/e2e/accessibility.cy.ts` — `cy.focused()` is checked after Retry (stays on the same question's heading), after Next (moves to the *new* question's heading, not just "still focused on something"), and after Finish (moves to the summary's heading) — not just eyeballed.

## Keyboard-only navigation

Verified two ways:
1. **Structural audit** — every interactive element in the app (`document.querySelectorAll('a, button, input, textarea, select, [tabindex]')`) was checked directly: all use real semantic HTML with the default `tabIndex: 0`, none `disabled`, none `aria-hidden`, and the DOM order matches the visual reading order on every page. A `grep` for keyboard event handlers found exactly two, both `event.preventDefault()` inside a form's `onSubmit` — the standard, correct pattern for handling submission via JS instead of a full page reload, which doesn't affect Enter-to-submit or any other native keyboard behavior. There are no custom click-only widgets anywhere (no `<div onClick>` standing in for a button) and no keyboard traps.
2. **Automated focus assertions** — see the Focus management section above.

I attempted to also drive the full flow live with real Tab/Enter key presses in a browser as a third check, but the sandboxed browser tool in this environment wasn't reliably delivering synthetic key events to the page during this session (confirmed independently of this app — even a manually-`focus()`ed button didn't respond to a synthesized Enter key). I'm noting this honestly rather than claiming a live demonstration I couldn't actually complete: the structural audit and the focus-assertion tests above are real, but a live keystroke-by-keystroke walkthrough of the whole flow (sign up → paste job description → pick difficulty → generate → answer all 5 (with a retry) → summary → history) is the one piece of the task I could not personally complete this session and would want re-verified with a working input pipeline (a real browser, or a Cypress plugin like `cypress-real-events`, would both work).

## The one concrete fix to know for evaluation

**Focus management on Next/Retry/Finish.** Before this audit, clicking "Next question" (or "Retry this question", or finishing the session) silently reset a keyboard or screen-reader user's position to the top of the document with zero indication anything had changed — from their perspective, the button they just activated could have done nothing at all. Now, each of those actions moves focus to the new content's heading, so a screen reader immediately announces the new question (or "Session complete"), and a keyboard user's next Tab press continues from a sensible point instead of the very top of the page. This is invisible to a mouse user but is the difference between the practice flow being usable or completely disorienting for anyone navigating without one.
