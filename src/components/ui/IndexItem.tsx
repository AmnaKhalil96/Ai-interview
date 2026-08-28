// Renders one row of the numbered "how it works" list on the landing page.
// Deliberately not a 3-column icon-card grid (the generic SaaS pattern) —
// a vertical, numbered, hairline-divided list reads more like an editorial
// table of contents, which fits the rest of the visual identity.
interface IndexItemProps {
  number: string;
  title: string;
  description: string;
}

export default function IndexItem({ number, title, description }: IndexItemProps) {
  return (
    <div className="flex gap-6 border-t border-line py-6 first:border-t-0 first:pt-0">
      <span className="font-mono text-sm text-accent">{number}</span>
      <div className="flex flex-col gap-1.5">
        {/* h2, not h3 — this follows the page's h1 directly with nothing
            in between, so h3 skipped a level (axe: heading-order). */}
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{description}</p>
      </div>
    </div>
  );
}
