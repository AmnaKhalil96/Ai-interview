"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signOutUser } from "@/lib/auth";

// Lives at the layout level (rendered once in app/layout.tsx) rather than
// being copy-pasted into each page, so "consistent across pages" is
// structural instead of a convention every new page has to remember to
// follow. Needs "use client" for usePathname (to highlight the active
// link) and useAuth (to show the signed-in user) — everything else about
// it is static.
const NAV_LINKS = [
  { href: "/", label: "Practice" },
  { href: "/history", label: "History" },
] as const;

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  async function handleSignOut() {
    await signOutUser();
    router.push("/");
  }

  return (
    // flex-wrap (not a collapsed hamburger menu) is the deliberate fix here:
    // logo + nav + account controls together don't fit one row under ~360px
    // wide with a real email address showing, so at that width the account
    // controls drop to their own row instead of overflowing or forcing
    // horizontal scroll — everything stays visible, nothing gets hidden
    // behind a menu toggle.
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-8 sm:px-10">
      <Link href="/" className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-mono text-sm uppercase tracking-[0.2em] text-ink">InterviewIQ</span>
      </Link>
      <div className="flex items-center gap-3 sm:gap-6">
        <nav aria-label="Main">
          <ul className="flex items-center gap-3 sm:gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`font-mono text-xs uppercase tracking-[0.2em] transition-colors ${
                      isActive ? "text-accent" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {!loading && (
          <div className="flex items-center gap-3 border-l border-line pl-3 sm:gap-4 sm:pl-6">
            {user ? (
              <>
                <span className="hidden max-w-[140px] truncate font-mono text-xs text-ink-soft sm:inline md:max-w-[280px] lg:max-w-none">
                  {user.displayName ?? user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="font-mono text-xs uppercase tracking-[0.2em] text-accent underline underline-offset-4"
              >
                Sign in
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
