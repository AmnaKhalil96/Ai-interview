// A cheap, purely mechanical pre-check for the most obvious non-job-description
// input — a single character or word mashed/repeated over and over
// ("asdfasdfasdf", "test test test test"). Anything subtler than that (a
// coherent paragraph that just isn't a job posting, e.g. a recipe) requires
// actual language understanding, which is exactly what the AI-based
// validity check in lib/ai/generateQuestions.ts is for. This function only
// exists to avoid spending an API call on garbage that a few string
// operations can already catch for free.
export function looksLikeRepeatedGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // A long run of the same character, e.g. someone holding down a key.
  if (/(.)\1{19,}/.test(trimmed)) return true;

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  // Below this, there isn't enough text for "few distinct words" to mean
  // anything — let the length check elsewhere in the form handle short input.
  if (words.length < 6) return false;

  const uniqueWords = new Set(words);
  // A real job description of any length uses far more varied vocabulary
  // than one or two words repeated across a dozen-plus words.
  return uniqueWords.size <= 2;
}
