import { addDoc, collection, getDocs, query, serverTimestamp, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { computeAverageScore } from "@/lib/sessionSummary";
import { DEFAULT_DIFFICULTY, isDifficulty } from "@/lib/difficulty";
import type { Difficulty, Feedback, Question, Session } from "@/types";

// All Firestore-specific code (collection name, the Timestamp <-> ISO
// string conversion, the query shape) stays in this one module — the rest
// of the app calls saveSession/fetchSessions and only ever sees the plain
// Session type from @/types.
const COLLECTION = "sessions";

// Verified by testing against an unconfigured project (empty env vars):
// addDoc/getDocs don't reject quickly in that case, they hang indefinitely
// with no network request ever appearing in devtools — there's no
// project/API key for the SDK to even fail a connection against. Without
// this timeout, a missing or wrong Firebase config would leave the UI
// stuck on "Saving your results…" or "Loading your past sessions…"
// forever instead of surfacing the error states this app already has.
const FIRESTORE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore request timed out.")), ms);
    }),
  ]);
}

interface SaveSessionInput {
  userId: string;
  jobDescription: string;
  difficulty: Difficulty;
  questions: Question[];
  answers: string[];
  feedbacks: Feedback[];
}

export async function saveSession(input: SaveSessionInput): Promise<void> {
  await withTimeout(
    addDoc(collection(db, COLLECTION), {
      userId: input.userId,
      jobDescription: input.jobDescription,
      difficulty: input.difficulty,
      questions: input.questions,
      answers: input.answers,
      feedbacks: input.feedbacks,
      averageScore: computeAverageScore(input.feedbacks),
      createdAt: serverTimestamp(),
    }),
    FIRESTORE_TIMEOUT_MS
  );
}

// Filters by userId only, then sorts by createdAt in JS, rather than
// adding `orderBy("createdAt", "desc")` to the Firestore query. An
// equality filter combined with an orderBy on a *different* field is a
// compound query, and Firestore requires a manually-provisioned composite
// index for that — the query would work fine locally and then throw
// "FAILED_PRECONDITION: The query requires an index" the first time it ran
// against a fresh project, pointing at a console link that has to be
// clicked and waited on before the app works. For the handful of sessions
// one person generates practicing interviews, sorting a short array in
// memory costs nothing and needs zero Firestore console setup — a better
// trade for this project's scale than a "properly indexed" query.
export async function fetchSessions(userId: string): Promise<Session[]> {
  const snapshot = await withTimeout(
    getDocs(query(collection(db, COLLECTION), where("userId", "==", userId))),
    FIRESTORE_TIMEOUT_MS
  );

  return snapshot.docs
    .map((docSnapshot): Session => {
      const data = docSnapshot.data();
      const createdAt = data.createdAt as Timestamp | undefined;
      return {
        id: docSnapshot.id,
        userId: (data.userId as string) ?? userId,
        jobDescription: (data.jobDescription as string) ?? "",
        // Falls back for sessions saved before this field existed — an
        // old Firestore doc simply has no "difficulty" key, not an invalid
        // one, so this isn't really "defensive against bad data" so much
        // as "defensive against data older than this feature."
        difficulty: isDifficulty(data.difficulty) ? data.difficulty : DEFAULT_DIFFICULTY,
        questions: (data.questions as Question[]) ?? [],
        answers: (data.answers as string[]) ?? [],
        feedbacks: (data.feedbacks as Feedback[]) ?? [],
        averageScore: (data.averageScore as number) ?? 0,
        // A doc can briefly have no resolved createdAt if it's read back
        // before the serverTimestamp() write has synced — falls back to
        // epoch so it sorts last rather than crashing the page.
        createdAt: createdAt ? createdAt.toDate().toISOString() : new Date(0).toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
