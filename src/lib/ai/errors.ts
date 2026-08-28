// Shared between every AI call site (generateQuestions.ts, evaluateAnswer.ts,
// and whatever comes next) so all of them report failures the same way:
// "api_error" means the provider call itself failed (network, auth, rate
// limit); "invalid_response" means the provider answered but the text
// wasn't the JSON we asked for; "invalid_input" means the provider
// answered normally but judged the *user's* input unusable for the task
// (e.g. generateQuestions.ts asking Gemini to first check whether the
// pasted text is actually a job description). Callers (API routes) branch
// on `kind` without needing to know which AI call produced the error.
export type AIGenerationErrorKind = "api_error" | "invalid_response" | "invalid_input";

export class AIGenerationError extends Error {
  readonly kind: AIGenerationErrorKind;

  constructor(kind: AIGenerationErrorKind, message: string) {
    super(message);
    this.name = "AIGenerationError";
    this.kind = kind;
  }
}
