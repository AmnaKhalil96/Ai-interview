import type { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";

// Lives in components/ui because it's a generic, reusable primitive with no
// knowledge of interviews/sessions — any future page (history, session)
// can use the same button without duplicating these styles.
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  // Generic "this button triggered an async action that's in flight" flag
  // — not specific to question generation — so any future async action
  // (retrying, saving) can reuse the same spinner instead of each call
  // site building its own.
  loading?: boolean;
  // "secondary" is for an action alongside a primary one on the same
  // screen (e.g. "Retry this question" next to "Next question") that
  // shouldn't visually compete with it — same size/shape, outlined instead
  // of filled, so it still reads as a real button rather than a text link.
  variant?: "primary" | "secondary";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-ink text-paper disabled:bg-ink/30 disabled:text-paper/70 enabled:hover:bg-accent",
  secondary:
    "border border-ink bg-transparent text-ink disabled:border-ink/30 disabled:text-ink/30 enabled:hover:bg-ink enabled:hover:text-paper",
};

export default function Button({
  children,
  className = "",
  disabled,
  loading = false,
  variant = "primary",
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      className={`
        group relative inline-flex w-full items-center justify-center gap-3
        overflow-hidden rounded-sm px-8 py-4
        font-sans text-base font-medium
        transition-colors duration-300 ease-out
        disabled:cursor-not-allowed
        ${VARIANT_CLASSES[variant]}
        ${className}
      `}
      {...rest}
    >
      <span className="relative">{children}</span>
      {loading ? (
        <Spinner className="relative h-4 w-4 shrink-0" />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="relative h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-enabled:group-hover:translate-x-1"
        >
          <path
            d="M1 8h13M9 3l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
