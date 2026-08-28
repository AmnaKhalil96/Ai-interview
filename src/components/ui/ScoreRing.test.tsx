// Covers the actual math this component does (clamping score/max into a
// 0-1 progress ratio before turning it into an SVG stroke-dashoffset), not
// just "it renders" — a wrong clamp would silently draw a broken or
// negative ring for an out-of-range score, which is exactly the kind of
// bug a snapshot test wouldn't catch.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreRing from "./ScoreRing";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function progressCircle(container: HTMLElement) {
  // The first circle is the static track; the second carries the
  // strokeDasharray/strokeDashoffset that actually draws progress.
  return container.querySelectorAll("circle")[1];
}

describe("ScoreRing", () => {
  it("renders the score and max as text", () => {
    render(<ScoreRing score={7} />);

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("exposes an accessible label describing the score out of max", () => {
    render(<ScoreRing score={7} max={10} />);

    expect(screen.getByRole("img", { name: "Score: 7 out of 10" })).toBeInTheDocument();
  });

  it("supports a custom max", () => {
    render(<ScoreRing score={3} max={5} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("/5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Score: 3 out of 5" })).toBeInTheDocument();
  });

  it("draws a fully-empty ring for a score of 0", () => {
    const { container } = render(<ScoreRing score={0} />);

    const offset = Number(progressCircle(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(CIRCUMFERENCE, 5);
  });

  it("draws a fully-filled ring for a score equal to max", () => {
    const { container } = render(<ScoreRing score={10} max={10} />);

    const offset = Number(progressCircle(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(0, 5);
  });

  it("clamps a score above max to a fully-filled ring instead of overshooting", () => {
    const { container } = render(<ScoreRing score={15} max={10} />);

    const offset = Number(progressCircle(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(0, 5);
  });

  it("draws a half-filled ring for a score at the midpoint", () => {
    const { container } = render(<ScoreRing score={5} max={10} />);

    const offset = Number(progressCircle(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(CIRCUMFERENCE * 0.5, 5);
  });
});
