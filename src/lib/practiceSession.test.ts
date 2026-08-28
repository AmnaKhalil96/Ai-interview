// Covers the sessionStorage read/write contract between the landing page
// (writer) and the session page (reader): a round trip returns the same
// data, and loadPracticeSession returns null (rather than throwing) for
// every way the stored value can be unusable — missing, corrupted JSON, or
// JSON that parses but doesn't match the expected shape — since the
// session page treats "null" as its one signal to show the empty state.
import { beforeEach, describe, expect, it } from "vitest";
import { loadPracticeSession, savePracticeSession } from "./practiceSession";

const STORAGE_KEY = "interviewiq:practice-session";

beforeEach(() => {
  sessionStorage.clear();
});

describe("practiceSession", () => {
  it("round-trips a saved session through loadPracticeSession", () => {
    const session = {
      jobDescription: "Senior Backend Engineer",
      difficulty: "senior" as const,
      questions: [{ id: "q1", type: "behavioral" as const, question: "Tell me about a challenge." }],
    };

    savePracticeSession(session);

    expect(loadPracticeSession()).toEqual(session);
  });

  it("returns null when nothing has been saved", () => {
    expect(loadPracticeSession()).toBeNull();
  });

  it("returns null when the stored value isn't valid JSON", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    expect(loadPracticeSession()).toBeNull();
  });

  it("returns null when jobDescription is missing", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ difficulty: "mid", questions: [] }));

    expect(loadPracticeSession()).toBeNull();
  });

  it("returns null when questions isn't an array", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobDescription: "A role", difficulty: "mid", questions: "not an array" })
    );

    expect(loadPracticeSession()).toBeNull();
  });

  it("returns null when difficulty is missing or not a recognized value", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobDescription: "A role", questions: [] })
    );
    expect(loadPracticeSession()).toBeNull();

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobDescription: "A role", difficulty: "expert", questions: [] })
    );
    expect(loadPracticeSession()).toBeNull();
  });

  it("returns null when the stored value is a JSON primitive, not an object", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify("just a string"));

    expect(loadPracticeSession()).toBeNull();
  });
});
