import type { ReactNode } from "react";

// The small uppercase mono label used throughout the editorial layout
// (e.g. "01 — JOB DESCRIPTION"). Pulled into one primitive so the tracking,
// size and color stay identical everywhere it appears instead of being
// retyped as raw utility classes on every heading.
interface KickerProps {
  children: ReactNode;
  index?: string;
}

export default function Kicker({ children, index }: KickerProps) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
      {index && <span className="text-accent">{index}</span>}
      {children}
    </p>
  );
}
