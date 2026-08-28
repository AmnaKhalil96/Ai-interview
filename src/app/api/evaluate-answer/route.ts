import { NextResponse } from "next/server";
import { evaluateAnswer, AIGenerationError } from "@/lib/ai/evaluateAnswer";
import type { QuestionType } from "@/types";

// Mirrors app/api/generate-questions/route.ts: validate everything the AI
// module assumes before calling it, then map AIGenerationError's `kind` to
// a status/message the same way both times, so the two features fail in a
// way the client can handle identically.
const MAX_ANSWER_LENGTH = 4000;

function isQuestionType(value: unknown): value is QuestionType {
  return value === "behavioral" || value === "technical";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { question, questionType, answer } = (body ?? {}) as {
    question?: unknown;
    questionType?: unknown;
    answer?: unknown;
  };

  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "question is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (!isQuestionType(questionType)) {
    return NextResponse.json(
      { error: 'questionType is required and must be "behavioral" or "technical".' },
      { status: 400 }
    );
  }

  if (typeof answer !== "string" || answer.trim().length === 0) {
    return NextResponse.json(
      { error: "answer is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json(
      { error: `answer must be ${MAX_ANSWER_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  try {
    const feedback = await evaluateAnswer({
      question: question.trim(),
      questionType,
      answer: answer.trim(),
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    if (error instanceof AIGenerationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while evaluating your answer." },
      { status: 500 }
    );
  }
}
