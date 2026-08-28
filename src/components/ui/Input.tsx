import type { InputHTMLAttributes } from "react";

// Generic styled single-line input primitive, mirroring TextArea's styling
// so a form mixing both (like the login form's email + password fields)
// looks consistent without either component knowing about the other.
type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`
        w-full rounded-sm border border-line bg-paper-raised
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
