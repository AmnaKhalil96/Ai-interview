// Covers the actual logic in this module — average score computation and
// its rounding, Firestore Timestamp -> ISO string conversion, descending
// sort by createdAt, defensive fallbacks for a doc missing fields, and the
// withTimeout guard added after a real observed Firestore hang against an
// unconfigured project (see the comment on FIRESTORE_TIMEOUT_MS in
// sessions.ts) — not the Firestore SDK itself, which is fully mocked so
// this suite never touches a network or a real project.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Feedback } from "@/types";

const mockAddDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockWhere = vi.fn((field: string, op: string, value: string) => ({ field, op, value }));
const mockCollection = vi.fn((db: unknown, name: string) => ({ db, name }));
const mockQuery = vi.fn((...args: unknown[]) => ({ args }));
const mockServerTimestamp = vi.fn(() => "SERVER_TIMESTAMP_SENTINEL");

vi.mock("firebase/firestore", () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  collection: (...args: unknown[]) => mockCollection(...(args as [unknown, string])),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...(args as [string, string, string])),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: class {},
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { fetchSessions, saveSession } from "./sessions";

function feedback(score: number): Feedback {
  return { score, strengths: [], gaps: [], improvedAnswer: "x" };
}

function fakeTimestamp(iso: string) {
  return { toDate: () => new Date(iso) };
}

function fakeDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  mockAddDoc.mockReset();
  mockGetDocs.mockReset();
  mockWhere.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("saveSession", () => {
  it("writes userId, difficulty, a serverTimestamp, and the computed average score", async () => {
    mockAddDoc.mockResolvedValueOnce({});

    await saveSession({
      userId: "test-user-id",
      jobDescription: "Senior Backend Engineer",
      difficulty: "senior",
      questions: [],
      answers: ["a1", "a2"],
      feedbacks: [feedback(7), feedback(7), feedback(8)],
    });

    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload).toMatchObject({
      userId: "test-user-id",
      jobDescription: "Senior Backend Engineer",
      difficulty: "senior",
      averageScore: 7.3, // (7+7+8)/3 = 7.333... rounded to 1 decimal
      createdAt: "SERVER_TIMESTAMP_SENTINEL",
    });
  });

  it("computes an average score of 0 when there are no feedbacks yet", async () => {
    mockAddDoc.mockResolvedValueOnce({});

    await saveSession({
      userId: "test-user-id",
      jobDescription: "Role",
      difficulty: "mid",
      questions: [],
      answers: [],
      feedbacks: [],
    });

    expect(mockAddDoc.mock.calls[0][1]).toMatchObject({ averageScore: 0 });
  });

  it("rejects if the write hangs past the Firestore timeout", async () => {
    vi.useFakeTimers();
    mockAddDoc.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const pending = saveSession({
      userId: "test-user-id",
      jobDescription: "Role",
      difficulty: "mid",
      questions: [],
      answers: [],
      feedbacks: [],
    });
    const assertion = expect(pending).rejects.toThrow("Firestore request timed out.");

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});

describe("fetchSessions", () => {
  it("queries by the given userId", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await fetchSessions("some-id");

    expect(mockWhere).toHaveBeenCalledWith("userId", "==", "some-id");
  });

  it("converts a Firestore Timestamp to an ISO string", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        fakeDoc("doc1", {
          userId: "a1",
          jobDescription: "Role",
          difficulty: "entry",
          questions: [],
          answers: [],
          feedbacks: [],
          averageScore: 8,
          createdAt: fakeTimestamp("2026-01-15T10:00:00.000Z"),
        }),
      ],
    });

    const [session] = await fetchSessions("a1");

    expect(session).toMatchObject({
      id: "doc1",
      createdAt: "2026-01-15T10:00:00.000Z",
      averageScore: 8,
      difficulty: "entry",
    });
  });

  it("falls back to the default difficulty for a session saved before this field existed", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [fakeDoc("pre-feature", {})] });

    const [session] = await fetchSessions("a1");

    expect(session.difficulty).toBe("mid");
  });

  it("ignores an unrecognized stored difficulty value and falls back to the default", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [fakeDoc("bad-value", { difficulty: "impossible" })] });

    const [session] = await fetchSessions("a1");

    expect(session.difficulty).toBe("mid");
  });

  it("sorts sessions by createdAt descending", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        fakeDoc("older", { createdAt: fakeTimestamp("2026-01-01T00:00:00.000Z") }),
        fakeDoc("newest", { createdAt: fakeTimestamp("2026-03-01T00:00:00.000Z") }),
        fakeDoc("middle", { createdAt: fakeTimestamp("2026-02-01T00:00:00.000Z") }),
      ],
    });

    const sessions = await fetchSessions("a1");

    expect(sessions.map((s) => s.id)).toEqual(["newest", "middle", "older"]);
  });

  it("falls back to the epoch when createdAt is missing, sorting it last", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        fakeDoc("has-date", { createdAt: fakeTimestamp("2026-01-01T00:00:00.000Z") }),
        fakeDoc("no-date", {}),
      ],
    });

    const sessions = await fetchSessions("a1");

    expect(sessions.map((s) => s.id)).toEqual(["has-date", "no-date"]);
    expect(sessions[1].createdAt).toBe(new Date(0).toISOString());
  });

  it("defaults missing array and number fields defensively", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [fakeDoc("sparse", {})] });

    const [session] = await fetchSessions("a1");

    expect(session.questions).toEqual([]);
    expect(session.answers).toEqual([]);
    expect(session.feedbacks).toEqual([]);
    expect(session.averageScore).toBe(0);
    expect(session.jobDescription).toBe("");
  });

  it("rejects if the read hangs past the Firestore timeout", async () => {
    vi.useFakeTimers();
    mockGetDocs.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const pending = fetchSessions("a1");
    const assertion = expect(pending).rejects.toThrow("Firestore request timed out.");

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
