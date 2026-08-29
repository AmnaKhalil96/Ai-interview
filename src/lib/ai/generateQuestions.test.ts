// Covers parseGenerationResult's validation logic inside generateQuestions
// (exercised indirectly since it's a private function — see the module's
// own comment on why "valid JSON" isn't trusted as "the JSON we asked
// for"), including the invalid_input path added to reject gibberish/
// unrelated text that Gemini itself judges isn't a job description — the
// bug this file's validity check exists to fix. Also covers the
// api_error vs invalid_response split, the timeout-abort path added after
// a real observed Gemini hang, and the missing-API-key guard. The Gemini
// SDK itself is mocked throughout — this suite never makes a network call.
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
    SchemaType: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", INTEGER: "INTEGER", BOOLEAN: "BOOLEAN" },
  };
});

import { GoogleGenerativeAIAbortError } from "@google/generative-ai";
import { generateQuestions } from "./generateQuestions";
import { AIGenerationError } from "./errors";

function respondWith(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });
}

const validQuestions = [
  { id: "q1", type: "behavioral", question: "Tell me about a time you led a project." },
  { id: "q2", type: "behavioral", question: "Describe a conflict with a teammate." },
  { id: "q3", type: "behavioral", question: "Tell me about a failure you learned from." },
  { id: "q4", type: "technical", question: "How would you design a rate limiter?" },
  { id: "q5", type: "technical", question: "Explain how you'd debug a memory leak." },
];

const validResult = {
  isValidJobDescription: true,
  reason: "",
  questions: validQuestions,
};

function invalidResult(reason = "") {
  return { isValidJobDescription: false, reason, questions: [] };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockGenerateContent.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generateQuestions", () => {
  it("returns the parsed questions when Gemini judges the input a valid job description", async () => {
    respondWith(JSON.stringify(validResult));

    const result = await generateQuestions("A job description", "mid");

    expect(result).toEqual(validQuestions);
  });

  it("strips markdown code fences before parsing", async () => {
    respondWith("```json\n" + JSON.stringify(validResult) + "\n```");

    const result = await generateQuestions("A job description", "mid");

    expect(result).toEqual(validQuestions);
  });

  describe("invalid input (the bug this validity check fixes)", () => {
    it("throws invalid_input when Gemini judges the text isn't a job description", async () => {
      respondWith(JSON.stringify(invalidResult("it's a recipe for banana bread")));

      await expect(generateQuestions("banana bread recipe...", "mid")).rejects.toMatchObject({
        kind: "invalid_input",
      });
    });

    it("includes Gemini's reason in the error message when one is given", async () => {
      respondWith(JSON.stringify(invalidResult("it's a recipe for banana bread")));

      await expect(generateQuestions("banana bread recipe...", "mid")).rejects.toMatchObject({
        message: expect.stringContaining("it's a recipe for banana bread"),
      });
    });

    it("falls back to a default message when Gemini gives no reason", async () => {
      respondWith(JSON.stringify(invalidResult("")));

      await expect(generateQuestions("asdf asdf asdf", "mid")).rejects.toMatchObject({
        kind: "invalid_input",
        message: expect.stringContaining("doesn't look like a job description"),
      });
    });

    it("does not require exactly 5 questions when the input was judged invalid", async () => {
      // questions is genuinely empty for a rejected input — this must not
      // be misreported as a malformed *response* when it's a rejected
      // *input*.
      respondWith(JSON.stringify(invalidResult("gibberish")));

      const error = await generateQuestions("asdf", "mid").catch((e) => e);
      expect(error).toBeInstanceOf(AIGenerationError);
      expect(error.kind).toBe("invalid_input");
    });
  });

  it("throws invalid_response when the response isn't valid JSON", async () => {
    respondWith("this is not json {{{");

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when isValidJobDescription is missing entirely", async () => {
    respondWith(JSON.stringify({ questions: validQuestions }));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when marked valid but the array doesn't have exactly 5 questions", async () => {
    respondWith(JSON.stringify({ ...validResult, questions: validQuestions.slice(0, 3) }));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when a question is missing a required field", async () => {
    const broken = validQuestions.map((q, i) => (i === 2 ? { id: q.id, type: q.type } : q));
    respondWith(JSON.stringify({ ...validResult, questions: broken }));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when a question has an invalid type value", async () => {
    const broken = validQuestions.map((q, i) => (i === 0 ? { ...q, type: "coding" } : q));
    respondWith(JSON.stringify({ ...validResult, questions: broken }));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws invalid_response when a question's text is blank", async () => {
    const broken = validQuestions.map((q, i) => (i === 4 ? { ...q, question: "   " } : q));
    respondWith(JSON.stringify({ ...validResult, questions: broken }));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("throws api_error when the Gemini call rejects for a generic reason", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("network down"));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI request failed. Please try again in a moment.",
    });
  });

  it("throws a distinct timeout message when the Gemini call aborts", async () => {
    mockGenerateContent.mockRejectedValueOnce(new GoogleGenerativeAIAbortError("aborted"));

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI is taking too long to respond. Please try again.",
    });
  });

  it("throws api_error without calling Gemini when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(generateQuestions("job", "mid")).rejects.toMatchObject({ kind: "api_error" });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("rejects with an AIGenerationError instance, not a bare Error", async () => {
    respondWith("not json");

    await expect(generateQuestions("job", "mid")).rejects.toBeInstanceOf(AIGenerationError);
  });

  describe("difficulty calibration", () => {
    it.each([
      ["entry", /entry-level/i],
      ["mid", /mid-level/i],
      ["senior", /senior/i],
    ] as const)("includes %s-specific guidance in the prompt sent to Gemini", async (difficulty, expected) => {
      respondWith(JSON.stringify(validResult));

      await generateQuestions("job", difficulty);

      const [prompt] = mockGenerateContent.mock.calls[0];
      expect(prompt).toMatch(expected);
    });

    it("sends different prompts for different difficulty levels", async () => {
      respondWith(JSON.stringify(validResult));
      await generateQuestions("job", "entry");
      const entryPrompt = mockGenerateContent.mock.calls[0][0];

      respondWith(JSON.stringify(validResult));
      await generateQuestions("job", "senior");
      const seniorPrompt = mockGenerateContent.mock.calls[1][0];

      expect(entryPrompt).not.toBe(seniorPrompt);
    });
  });
});
