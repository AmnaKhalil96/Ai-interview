import type { TextareaHTMLAttributes } from "react";

// Generic styled textarea primitive — no job-description-specific logic
// lives here, so it stays reusable (e.g. a free-text answer field on the
// session page could use the exact same component later).
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function TextArea({ className = "", ...rest }: TextAreaProps) {
  return (
    <textarea
      className={`
        w-full resize-y rounded-sm border border-line bg-paper-raised
        px-5 py-4 font-sans text-[15px] leading-relaxed text-ink
        placeholder:text-ink-soft
        transition-shadow duration-200 ease-out
        focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10
        disabled:cursor-not-allowed disabled:opacity-60
        ${className}
      `}
      {...rest}
    />
  );
}
