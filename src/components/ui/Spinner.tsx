interface SpinnerProps {
  className?: string;
}

// Pulled out of Button once a second consumer (the history page's loading
// state) needed the exact same spinner — one shared primitive instead of
// two copies of the same SVG drifting apart over time.
export default function Spinner({ className = "h-4 w-4" }: SpinnerProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}
