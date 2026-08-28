// Covers the two mechanical patterns this heuristic exists to catch (a
// repeated character run, a repeated word/phrase) and confirms it doesn't
// false-positive on real, varied text — including a short-but-real job
// description, since this check runs before the AI-based validator and a
// false positive there would block a legitimate submission with no
// recourse but rewording.
import { describe, expect, it } from "vitest";
import { looksLikeRepeatedGarbage } from "./looksLikeRepeatedGarbage";

describe("looksLikeRepeatedGarbage", () => {
  it("flags a long run of the same character", () => {
    expect(looksLikeRepeatedGarbage("a".repeat(30))).toBe(true);
  });

  it("flags a single word repeated many times", () => {
    expect(looksLikeRepeatedGarbage("asdf asdf asdf asdf asdf asdf asdf")).toBe(true);
  });

  it("flags a short phrase repeated many times", () => {
    expect(looksLikeRepeatedGarbage("test test test test test test test test")).toBe(true);
  });

  it("does not flag a real, varied job description", () => {
    const jobDescription =
      "We are hiring a Senior Backend Engineer to design and scale our payments infrastructure, mentor junior engineers, and partner with product on API scoping.";
    expect(looksLikeRepeatedGarbage(jobDescription)).toBe(false);
  });

  it("does not flag a short but real job description", () => {
    expect(looksLikeRepeatedGarbage("Hiring a barista to make espresso and handle cash.")).toBe(
      false
    );
  });

  it("does not flag empty or whitespace-only input", () => {
    expect(looksLikeRepeatedGarbage("")).toBe(false);
    expect(looksLikeRepeatedGarbage("   ")).toBe(false);
  });

  it("does not flag short input regardless of repetition (too little text to judge)", () => {
    expect(looksLikeRepeatedGarbage("hi hi")).toBe(false);
  });
});
