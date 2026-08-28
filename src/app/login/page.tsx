import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

// Thin page wrapper — all the actual logic lives in LoginForm so it can be
// unit-tested without Next's routing/page conventions in the way.
// LoginForm reads the `redirect` search param (useSearchParams), which
// Next.js requires to be wrapped in Suspense so the page can still be
// statically rendered.
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <LoginForm />
    </Suspense>
  );
}
