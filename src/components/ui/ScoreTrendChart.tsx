interface ScoreTrendChartProps {
  // Oldest first — the chart reads left to right like a timeline, which is
  // the opposite order from the history list below it (newest first, so
  // your most recent session is the one you don't have to scroll to).
  scores: number[];
  max?: number;
}

// A hand-rolled SVG line rather than a charting library: five numbers on
// an axis don't need a dependency, and building it from the same
// currentColor + text-accent/text-line tokens as ScoreRing keeps it
// visually part of this design system instead of looking like a
// default-themed widget dropped in from elsewhere.
export default function ScoreTrendChart({ scores, max = 10 }: ScoreTrendChartProps) {
  if (scores.length === 0) return null;

  const width = 300;
  const height = 100;
  const padding = 10;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const stepX = scores.length > 1 ? plotWidth / (scores.length - 1) : 0;
  const points = scores.map((score, index) => ({
    x: padding + (scores.length > 1 ? index * stepX : plotWidth / 2),
    y: padding + plotHeight - (Math.max(0, Math.min(score, max)) / max) * plotHeight,
  }));

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  // The SVG itself is decorative (aria-hidden) — this sentence is the
  // actual accessible content, so a screen reader gets the trend as a
  // sentence instead of silence or a confusing shape description.
  const summary = `Score trend across ${scores.length} session${scores.length === 1 ? "" : "s"}, oldest to newest: ${scores.join(", ")} out of ${max}.`;

  return (
    <div>
      <span className="sr-only">{summary}</span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="h-28 w-full overflow-visible text-line"
        preserveAspectRatio="none"
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeWidth="1" />
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="3" fill="currentColor" className="text-accent" />
        ))}
      </svg>
    </div>
  );
}
