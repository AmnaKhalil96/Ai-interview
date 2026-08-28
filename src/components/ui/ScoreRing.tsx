// A generic "N out of a max, as a ring" primitive — not specific to answer
// feedback — so it stays in ui/ rather than living inside FeedbackDisplay.
// Built as an SVG progress ring instead of a horizontal bar because the
// task asked for something other than "a generic progress bar," and a
// ring reads as a single, deliberate number rather than a loading meter.
interface ScoreRingProps {
  score: number;
  max?: number;
  size?: number;
}

export default function ScoreRing({ score, max = 10, size = 96 }: ScoreRingProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, score / max));
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div
      role="img"
      aria-label={`Score: ${score} out of ${max}`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="text-line" stroke="currentColor" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-accent"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <span className="absolute font-display text-3xl text-ink" aria-hidden="true">
        {score}
        <span className="text-base text-ink-soft">/{max}</span>
      </span>
    </div>
  );
}
