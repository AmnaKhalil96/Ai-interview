"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Kicker from "@/components/ui/Kicker";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { signIn, signUp, signInWithGoogle, getAuthErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth";

type Mode = "login" | "signup";
type Status = "idle" | "submitting";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side validation is a UX nicety, not the source of truth — Firebase
// still rejects a malformed email or weak password server-side regardless.
// Its job here is just to catch the obvious cases before spending a round
// trip, and to keep the error copy in the app's own voice rather than
// whatever Firebase would return for the same mistake.
function validate(mode: Mode, email: string, password: string): string | null {
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length === 0) return "Enter your password.";
  return null;
}

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const validationError = validate(mode, email.trim(), password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus("submitting");
    setError(null);

    const action = mode === "signup" ? signUp(email.trim(), password) : signIn(email.trim(), password);
    action
      .then(() => router.push(redirectTo))
      .catch((err: unknown) => {
        setStatus("idle");
        setError(getAuthErrorMessage(err));
      });
  }

  function handleGoogleSignIn() {
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);

    signInWithGoogle()
      .then(() => router.push(redirectTo))
      .catch((err: unknown) => {
        setStatus("idle");
        setError(getAuthErrorMessage(err));
      });
  }

  function toggleMode() {
    setMode((current) => (current === "login" ? "signup" : "login"));
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-8 px-6 pb-16 sm:px-10">
      <div className="flex flex-col gap-2">
        <Kicker index="00">{mode === "login" ? "Log in" : "Sign up"}</Kicker>
        <h1 className="font-display text-3xl text-ink">
          {mode === "login" ? "Welcome back." : "Create your account."}
        </h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          {mode === "login"
            ? "Log in to see your practice history and pick up where you left off."
            : "Sign up to save your practice sessions and track your progress over time."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-md border border-line bg-paper-raised p-6 shadow-[0_1px_0_0_rgb(var(--line))] sm:p-8"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === "submitting"}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={status === "submitting"}
            required
            minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
          />
        </div>

        {error && (
          <p role="alert" aria-live="assertive" className="text-sm leading-relaxed text-ink">
            {error}
          </p>
        )}

        <Button type="submit" loading={status === "submitting"}>
          {mode === "login" ? "Log in" : "Sign up"}
        </Button>

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-line" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">or</span>
          <span className="h-px flex-1 bg-line" aria-hidden="true" />
        </div>

        <Button type="button" onClick={handleGoogleSignIn} loading={status === "submitting"}>
          Continue with Google
        </Button>
      </form>

      <button
        type="button"
        onClick={toggleMode}
        className="self-center font-mono text-xs uppercase tracking-[0.2em] text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </main>
  );
}
