// Covers parseFeedback's validation (score range/integer-ness, strengths/gaps
// as string arrays, non-empty improvedAnswer), the same api_error vs
// invalid_response split and timeout-abort path as generateQuestions.test.ts,
// and — specific to this module — that the prompt actually branches into a
// STAR-method rubric for behavioral questions vs a correctness/clarity
// rubric for technical ones, since that distinction is this file's whole
// reason for existing separately from a generic "grade this" prompt. The
// Gemini SDK is mocked throughout; no network calls are made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => {
  class GoogleGenerativeAIAbortError extends Error {}
  class GoogleGenerativeAIFetchError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  class GoogleGenerativeAI {
    constructor() {}
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  }
  return {
    GoogleGenerativeAI,
    GoogleGenerativeAIAbortError,
    GoogleGenerativeAIFetchError,
    SchemaType: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", INTEGER: "INTEGER" },
  };
});

import { GoogleGenerativeAIAbortError } from "@google/generative-ai";
import { evaluateAnswer } from "./evaluateAnswer";
import { AIGenerationError } from "./errors";

function respondWith(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });
}

const validFeedback = {
  score: 7,
  strengths: ["Clear structure", "Concrete example"],
  gaps: ["Missing a measurable result"],
  improvedAnswer: "A tightened version of the answer.",
};

const baseInput = {
  question: "Tell me about a time you resolved a conflict.",
  questionType: "behavioral" as const,
  answer: "I talked to my teammate and we found a compromise.",
};

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockGenerateContent.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("evaluateAnswer", () => {
  it("returns the parsed feedback when Gemini responds with valid JSON", async () => {
    respondWith(JSON.stringify(validFeedback));

    const result = await evaluateAnswer(baseInput);

    expect(result).toEqual(validFeedback);
  });

  it("strips markdown code fences before parsing", async () => {
    respondWith("```json\n" + JSON.stringify(validFeedback) + "\n```");

    const result = await evaluateAnswer(baseInput);

    expect(result).toEqual(validFeedback);
  });

  it("throws invalid_response when the response isn't valid JSON", async () => {
    respondWith("not json at all");

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when score is out of the 1-10 range", async () => {
    respondWith(JSON.stringify({ ...validFeedback, score: 11 }));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when score is not an integer", async () => {
    respondWith(JSON.stringify({ ...validFeedback, score: 7.5 }));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when strengths is not an array of strings", async () => {
    respondWith(JSON.stringify({ ...validFeedback, strengths: ["ok", 5] }));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when gaps is missing", async () => {
    const withoutGaps = {
      score: validFeedback.score,
      strengths: validFeedback.strengths,
      improvedAnswer: validFeedback.improvedAnswer,
    };
    respondWith(JSON.stringify(withoutGaps));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when improvedAnswer is blank", async () => {
    respondWith(JSON.stringify({ ...validFeedback, improvedAnswer: "   " }));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws api_error when the Gemini call rejects for a generic reason", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("network down"));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI request failed. Please try again in a moment.",
    });
  });

  it("throws a distinct timeout message when the Gemini call aborts", async () => {
    mockGenerateContent.mockRejectedValueOnce(new GoogleGenerativeAIAbortError("aborted"));

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI is taking too long to respond. Please try again.",
    });
  });

  it("throws api_error without calling Gemini when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(evaluateAnswer(baseInput)).rejects.toMatchObject({ kind: "api_error" });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("rejects with an AIGenerationError instance, not a bare Error", async () => {
    respondWith("not json");

    await expect(evaluateAnswer(baseInput)).rejects.toBeInstanceOf(AIGenerationError);
  });

  it("builds a STAR-method prompt for behavioral questions", async () => {
    respondWith(JSON.stringify(validFeedback));

    await evaluateAnswer({ ...baseInput, questionType: "behavioral" });

    const prompt = mockGenerateContent.mock.calls[0][0] as string;
    expect(prompt).toContain("STAR method");
    expect(prompt).toContain("Situation, Task, Action, Result");
  });

  it("builds a correctness/clarity/completeness prompt for technical questions", async () => {
    respondWith(JSON.stringify(validFeedback));

    await evaluateAnswer({ ...baseInput, questionType: "technical" });

    const prompt = mockGenerateContent.mock.calls[0][0] as string;
    expect(prompt).toContain("technical correctness");
    expect(prompt).not.toContain("STAR method");
  });
});
