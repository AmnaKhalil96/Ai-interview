import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DEFAULT_DIFFICULTY, isDifficulty, difficultyLabel } from "./difficulty";

describe("isDifficulty", () => {
  it("accepts each valid difficulty value", () => {
    expect(isDifficulty("entry")).toBe(true);
    expect(isDifficulty("mid")).toBe(true);
    expect(isDifficulty("senior")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDifficulty("expert")).toBe(false);
    expect(isDifficulty("")).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
    expect(isDifficulty(null)).toBe(false);
    expect(isDifficulty(3)).toBe(false);
  });
});

describe("difficultyLabel", () => {
  it("returns the display label for each value", () => {
    expect(difficultyLabel("entry")).toBe("Entry");
    expect(difficultyLabel("mid")).toBe("Mid");
    expect(difficultyLabel("senior")).toBe("Senior");
  });
});

describe("DIFFICULTIES / DEFAULT_DIFFICULTY", () => {
  it("lists exactly the three supported levels", () => {
    expect(DIFFICULTIES.map((d) => d.value)).toEqual(["entry", "mid", "senior"]);
  });

  it("defaults to a value that is itself valid", () => {
    expect(isDifficulty(DEFAULT_DIFFICULTY)).toBe(true);
  });
});
