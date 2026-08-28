# Lighthouse audit

**Tool:** Lighthouse 13 (programmatic API), against a real **production build** (`next build && next start`), never `next dev` — dev mode ships unminified code and extra dev-only overhead that would make every score meaningless.

**Pages tested:** the public landing page (`/`) and one authenticated page (`/history`), each at both **mobile** (Lighthouse's default throttled mobile emulation) and **desktop** (`desktop-config` preset — no throttling, desktop viewport).

**Why a custom script instead of the `lighthouse` CLI directly:** `/history` needs a signed-in Firebase session to render anything meaningful, and the CLI has no way to log in first. `scripts/lighthouse-audit.mjs` launches one Chrome instance, signs up a throwaway test account in it with Puppeteer (real Firebase Auth — the same approach already used by the Cypress E2E suite), then points Lighthouse at that same already-authenticated browser via its remote-debugging port, so `/history` is audited as a real logged-in user would actually see it, not a login wall.

**How to re-run it yourself:**
```
npm run build && npm run start     # terminal 1, production build on :3100
npm run audit:lighthouse           # terminal 2
```
Full JSON reports land in `lighthouse-results/*.json` (open one in Chrome's own Lighthouse viewer at [googlechrome.github.io/lighthouse/viewer](https://googlechrome.github.io/lighthouse/viewer/) for the full readable report with screenshots and filmstrip), plus a `summary.json` with just the four scores per page/form-factor.

## Scores

| Page | Form factor | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Landing (`/`) | Mobile | 73 → 88 → **90** | 100 | 100 | 100 |
| Landing (`/`) | Desktop | 100 | 100 | 100 | 100 |
| History (`/history`, authenticated) | Mobile | 50 → 71 → **92** | 100 | 100 | 100 |
| History (`/history`, authenticated) | Desktop | 82 → 80 → **100** | 100 | 100 | 100 |

Three numbers are shown: original → after the font fixes (round 1, below) → after the auth/loading-state fix (round 2, "Round 1 follow-up" below). Round 2 targeted `/history`'s remaining LCP problem specifically; landing picked up a small bonus (88 → 90) because one of the two round-2 fixes lives in shared code every page loads.

Accessibility, Best Practices, and SEO are a clean 100 across all four combinations — this cross-checks the axe-core fixes in `docs/accessibility-audit.md`: Lighthouse's own accessibility audit (a smaller but overlapping rule set) independently confirms zero issues on the same pages.

## What was dragging Performance down, and what I fixed

Inspecting the actual Lighthouse audit data (not just the headline score) for landing-mobile pointed at two distinct, unrelated problems, both font-related:

### 1. An unused variable-font axis request (the bigger of the two)
`layout.tsx` requested Fraunces (the display/headline serif) with `axes: ["opsz", "SOFT", "WONK"]` — extra variable-font axes beyond the default weight axis. A `grep` across the whole codebase found **zero** uses of `font-variation-settings` or those axis names anywhere — nothing in the app actually dials in the "soft" or "wonk" letterform variants. The two largest font files this produced were 105 KB and 120 KB.

**Fix:** dropped the `axes` option entirely (`src/app/layout.tsx`). The largest Fraunces file is now 36.5 KB — the two files that used to weigh 225 KB combined are gone. Landing page total byte weight dropped from 597 KB to 515 KB, and LCP improved from 3.7s to 3.1s on mobile.

### 2. A late font swap causing a "poor" layout shift
Lighthouse's `layout-shifts` audit traced the landing page's single largest layout shift (CLS **0.233**, in the "poor" range — anything over 0.25 is poor, "good" is under 0.1) to one specific file finishing its download and swapping in: IBM Plex Mono, used for every small uppercase "kicker" label throughout the app (`Kicker.tsx` and similar small labels). `font-display: swap` means the browser shows a fallback font immediately and swaps to the real one whenever it arrives — if that arrives late enough, and the fallback's letter widths differ enough from IBM Plex Mono's, the resulting reflow shifted content across almost the entire visible page.

**Fix:** changed just this one font's `display` from `"swap"` to `"optional"` (`src/app/layout.tsx`). `optional` gives the browser a very short window (roughly 100ms) to use the real font and commits to the fallback for the rest of that page load if it doesn't arrive in time — no late swap, no shift. This is a reasonable trade specifically for this font because it's pure editorial styling on small labels, not a font whose exact identity materially matters (unlike the display/body fonts, which keep `swap`). Landing-mobile CLS went from 0.233 (poor) to **0** (perfect) — with the same fix applying to `/history`, whose CLS also went from a similarly poor score to 0 (visible in the "after" desktop history run: `cumulative-layout-shift` score 1.0/0).

Together, these two changes took landing-mobile Performance from **73 to 88** and history-mobile from **50 to 71** — a change to two lines in one file (`src/app/layout.tsx`), verified by re-running the full audit and reading the underlying metrics, not just the headline number.

## Round 1 follow-up: `history-mobile` was still at 71 — what was actually dragging it down

The font fixes above left `history-mobile` at 71 and `history-desktop` at 80, both below the 85 target. Rather than guess, I re-read the actual audit JSON for `history-mobile` (not just the headline number) and back-calculated the category score from Lighthouse's own weighting (FCP 10%, Speed Index 10%, LCP 25%, TBT 30%, CLS 25%) to find which metric was really responsible:

| Metric | Score | Weighted points lost (of ~100) |
|---|---|---|
| LCP | 0.10 (≈6.3s) | ~22.5 |
| TBT | 0.73 | ~8.1 |
| FCP, Speed Index, CLS | all "good"/perfect | negligible |

**LCP was the entire story.** `server-response-time` (0ms), `network-rtt` (80ms), and `network-server-latency` (510ms) were all excellent, ruling out network transport — this was 100% client-side JS/data-readiness time.

Reading the LCP breakdown (`lcp-breakdown-insight`) identified the actual LCP *element*: not the page's own `<h1>`, not the existing "Loading your past sessions…" status line, but the **empty-state paragraph** ("You haven't finished a practice session yet…") that only appears once the Firestore fetch resolves. This is the browser's LCP algorithm doing exactly what it's specified to do: it always picks the largest-by-area content block painted so far, and re-anchors to a *later*, *larger* one if a bigger candidate shows up — so the existing one-line loading text (small) got superseded by the multi-line empty-state paragraph (bigger) the moment data arrived at ~6.3s, even though something had visibly painted on screen much earlier. The existing loading state wasn't missing, it was just too small to win.

This also ruled out "fix it by parallelizing auth and the fetch": the Firestore query is `where("userId", "==", uid)`, and `uid` only exists once Firebase Auth resolves client-side (`onAuthStateChanged`) — there's no way to start that query earlier without either not knowing which user's data to ask for, or querying unscoped data and filtering afterwards, which is a security regression, not an optimization. That waterfall stays exactly as it was; nothing about *when* the Firestore query fires changed in this round.

### Fix 1 (primary): a properly-sized skeleton, not a smaller "loading…" line

`src/app/history/page.tsx` previously rendered a blank `<main>` while auth was resolving, then a small one-line "Loading your past sessions…" status once auth resolved, then swapped in the real content once the Firestore fetch settled. Now:
- The blank pre-auth screen is gone — the page shell (heading) plus a loading state render immediately, before auth even resolves. This is UI only: **no session data is requested or shown before `user` is confirmed** by `useAuth()`, exactly as before — only what paints while waiting changed, not what's fetched or when.
- The loading state's text block is deliberately sized to match (never smaller than) the real empty-state paragraph it may be replaced by, in the same card layout. Because the browser's LCP algorithm only re-anchors to a *strictly larger* later candidate, a same-size (or larger) early paint keeps its LCP timestamp instead of being superseded once real content arrives.
- A couple of pulsing skeleton blocks (chart-card and session-row shaped, `aria-hidden`, no text) were added purely for perceived-loading UX for users who do have history — they aren't LCP candidates (LCP requires a text/image/video-poster node, not a plain background color) so they don't affect the metric, and `animate-pulse` is already neutralized under `prefers-reduced-motion` by the existing global rule in `globals.css`.

Result: `history-mobile` LCP dropped from **~6.3s to 2.4s**.

### Fix 2 (secondary, found while checking "is the Firebase SDK adding avoidable overhead here"): an eager Google-auth iframe load on every mobile page

The `bootup-time` audit showed ~178ms spent loading Google's GAPI iframe script (`apis.google.com/.../gapi_iframes/...`) on `/history` — a page that never uses Google Sign-In. Tracing it into `node_modules/firebase/node_modules/@firebase/auth`'s own source: the convenience `getAuth(app)` call (used in `src/lib/firebase.ts`) always wires in `browserPopupRedirectResolver` by default, and that resolver's `_shouldInitProactively` getter returns `true` on **any mobile browser or Safari** — so it eagerly opens a hidden iframe to prep for popup/redirect auth flows on every single page load on mobile, regardless of whether `GoogleAuthProvider` is ever touched. This is inherent to `getAuth()`'s defaults, not to this app's own `lib/auth.ts` construction of `GoogleAuthProvider` at module scope (which I'd originally suspected — that construction alone doesn't trigger it, so it was left as-is).

**Fix:** `src/lib/firebase.ts` now calls `initializeAuth(app, { persistence: [...] })` directly (the same persistence config `getAuth` uses internally) instead of `getAuth(app)`, omitting the resolver entirely so nothing proactively initializes on page load. `src/lib/auth.ts`'s `signInWithGoogle()` now passes `browserPopupRedirectResolver` as an explicit third argument to `signInWithPopup(...)` — the SDK's supported way to supply the resolver only at the moment a popup sign-in is actually requested, which is exactly the one place it's genuinely needed (currently only reachable from `/login`). Auth enforcement, persistence, and Google Sign-In itself are unchanged; only *when* this one resolver initializes changed.

This is why landing (which never fetches per-user data at all, but does load `lib/firebase.ts`/`lib/auth.ts` transitively through `SiteHeader.tsx` in the root layout) also picked up a small bonus, 88 → 90 — it's shared-bundle overhead removed from every page, not a `/history`-specific change.

## The two concrete fixes to know for evaluation

1. **Unused Fraunces font axes** (round 1) — see above: one deleted line, 73 → 88 on landing-mobile.
2. **A skeleton loading state sized to win the LCP race, plus removing an eager Google-auth iframe load from every page's default Firebase Auth initialization** (round 2) — moved `history-mobile` from 71 to 92 and `history-desktop` from 80 to 100, without changing the auth-then-fetch security model at all: auth is still resolved before any Firestore query, queries are still scoped to `user.uid`, and no data renders before authentication succeeds. The entire fix is about what paints while waiting and when one unrelated SDK resolver initializes — not about the sequencing of anything security-relevant.
