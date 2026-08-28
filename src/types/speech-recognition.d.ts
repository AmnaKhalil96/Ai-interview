// TypeScript's bundled DOM lib declares SpeechRecognitionAlternative,
// SpeechRecognitionResult and SpeechRecognitionResultList, but not the
// SpeechRecognition interface/constructor itself or its events — those are
// declared here so AnswerInput.tsx can use the Web Speech API without
// resorting to `any`. This file must not redeclare the interfaces above
// (TypeScript would treat that as a conflicting duplicate).
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

// Chrome/Edge expose the unprefixed name; Safari (where it's supported at
// all) only exposes the webkit-prefixed one — both are optional since
// neither exists in browsers without Web Speech API support at all.
interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
