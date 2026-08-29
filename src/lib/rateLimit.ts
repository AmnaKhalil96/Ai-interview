// Per-user, fixed-window rate limiting for the two Gemini-backed API
// routes, keyed on the authenticated caller's Firebase uid (see
// verifyIdToken.ts — these routes require a verified uid before this is
// ever consulted, so the key can't be spoofed by an unauthenticated caller
// picking their own key).
//
// Storage: a plain in-memory Map, not Firestore/Redis/Vercel KV.
//
// Why in-memory is the right call here, not just the easy one: Vercel
// serverless functions are NOT guaranteed to share memory across
// invocations — a burst of concurrent requests can land on multiple
// warm/cold instances, each with its own Map, so this is a *best-effort*
// limiter, not a hard distributed guarantee. A determined attacker
// spraying requests across many concurrent invocations could exceed the
// nominal limit by some multiple of instance count. What this reliably
// stops is the actual threat this task is about: a script (or a bored
// visitor) hammering one route in a loop, which in practice serializes
// through the same warm instance and gets capped correctly. For an app
// at this scale (a capstone project, not a high-traffic product), that's
// a reasonable trade against the added infra of a shared store.
//
// If usage grows enough that cross-instance precision starts to matter,
// swap this module's internals for Firestore-based counting (a
// `rateLimits/{uid}` doc updated via a transaction) or a managed store
// like Vercel KV / Upstash Redis — the `checkRateLimit` call sites in the
// route handlers wouldn't need to change, only this file's internals.
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Cheap opportunistic cleanup so `windows` doesn't grow unbounded over a
// long-lived warm instance — runs at most once a minute, trims anything
// whose window has already expired. Not required for correctness (an
// expired entry is treated as a fresh window regardless), purely to avoid
// leaking memory for uids that stop making requests.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  windows.forEach((window, key) => {
    if (window.resetAt <= now) windows.delete(key);
  });
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller can retry. Only meaningful when !allowed. */
  retryAfterSeconds: number;
}

// `key` should already namespace by route (e.g. "generate-questions:<uid>")
// so the two routes' limits never share a counter.
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// Exposed for tests only, to reset state between cases.
export function __resetRateLimitsForTests(): void {
  windows.clear();
}
