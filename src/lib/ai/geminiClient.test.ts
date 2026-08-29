// Covers the key-fallback logic in geminiClient.ts in isolation: a
// quota/rate-limit error (HTTP 429, surfaced by the SDK as
// GoogleGenerativeAIFetchError) triggers exactly one retry against
// GEMINI_API_KEY_BACKUP when it's configured, every other failure mode
// (generic errors, timeouts, non-429 HTTP errors) never touches the
// backup key at all, and the whole fallback path is a no-op when no
// backup key is set — the app must behave exactly as it did before
// fallback support existed in that case. The Gemini SDK is mocked
// throughout; no network calls are made.
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
    apiKey: string;
    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }
    getGenerativeModel() {
      const apiKey = this.apiKey;
      // Records which key a given call used as the mock's first argument
      // — the real SDK's generateContent doesn't take the key directly,
      // but this is the simplest way to assert "primary key first,
      // backup key second" without reaching into GoogleGenerativeAI's
      // internals.
      return {
        generateContent: (prompt: string, options: unknown) => mockGenerateContent(apiKey, prompt, options),
      };
    }
  }
  return { GoogleGenerativeAI, GoogleGenerativeAIAbortError, GoogleGenerativeAIFetchError };
});

import { GoogleGenerativeAIAbortError, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { generateContentWithFallback } from "./geminiClient";
import { AIGenerationError } from "./errors";

function respondWith(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });
}

const baseOptions = {
  modelParams: { model: "gemini-3.6-flash" },
  prompt: "a prompt",
  timeoutMs: 20_000,
  logPrefix: "[test]",
};

beforeEach(() => {
  mockGenerateContent.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "primary-key");
  vi.stubEnv("GEMINI_API_KEY_BACKUP", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generateContentWithFallback", () => {
  it("returns the response text on a successful primary-key call", async () => {
    respondWith("hello");

    const text = await generateContentWithFallback(baseOptions);

    expect(text).toBe("hello");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent.mock.calls[0][0]).toBe("primary-key");
  });

  it("retries once with the backup key on a 429 quota error, and returns the fallback's success", async () => {
    vi.stubEnv("GEMINI_API_KEY_BACKUP", "backup-key");
    mockGenerateContent.mockRejectedValueOnce(
      new GoogleGenerativeAIFetchError("quota exceeded", 429)
    );
    respondWith("fallback success");

    const text = await generateContentWithFallback(baseOptions);

    expect(text).toBe("fallback success");
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[0][0]).toBe("primary-key");
    expect(mockGenerateContent.mock.calls[1][0]).toBe("backup-key");
    // Fallback must be logged clearly (task requirement) so it's visible
    // in Vercel's function logs if it happens in production.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("retrying once with GEMINI_API_KEY_BACKUP")
    );
  });

  it("skips the fallback and fails normally when GEMINI_API_KEY_BACKUP is not set", async () => {
    // beforeEach already stubs GEMINI_API_KEY_BACKUP to "" (unset) — the
    // fallback path must be a complete no-op in this case, not a crash.
    mockGenerateContent.mockRejectedValueOnce(
      new GoogleGenerativeAIFetchError("quota exceeded", 429)
    );

    await expect(generateContentWithFallback(baseOptions)).rejects.toMatchObject({
      kind: "api_error",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("does not touch the backup key for a non-quota error, even if one is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY_BACKUP", "backup-key");
    mockGenerateContent.mockRejectedValueOnce(new Error("network down"));

    await expect(generateContentWithFallback(baseOptions)).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI request failed. Please try again in a moment.",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a non-429 GoogleGenerativeAIFetchError (e.g. a 500)", async () => {
    vi.stubEnv("GEMINI_API_KEY_BACKUP", "backup-key");
    mockGenerateContent.mockRejectedValueOnce(
      new GoogleGenerativeAIFetchError("internal error", 500)
    );

    await expect(generateContentWithFallback(baseOptions)).rejects.toMatchObject({
      kind: "api_error",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("still throws a distinct timeout message when the primary call aborts", async () => {
    vi.stubEnv("GEMINI_API_KEY_BACKUP", "backup-key");
    mockGenerateContent.mockRejectedValueOnce(new GoogleGenerativeAIAbortError("aborted"));

    await expect(generateContentWithFallback(baseOptions)).rejects.toMatchObject({
      kind: "api_error",
      message: "The AI is taking too long to respond. Please try again.",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("throws api_error if both the primary and backup calls fail with quota errors", async () => {
    vi.stubEnv("GEMINI_API_KEY_BACKUP", "backup-key");
    mockGenerateContent.mockRejectedValueOnce(
      new GoogleGenerativeAIFetchError("quota exceeded", 429)
    );
    mockGenerateContent.mockRejectedValueOnce(
      new GoogleGenerativeAIFetchError("quota exceeded", 429)
    );

    const error = await generateContentWithFallback(baseOptions).catch((e) => e);

    expect(error).toBeInstanceOf(AIGenerationError);
    expect(error).toMatchObject({ kind: "api_error" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("throws api_error without calling Gemini when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(generateContentWithFallback(baseOptions)).rejects.toMatchObject({
      kind: "api_error",
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
