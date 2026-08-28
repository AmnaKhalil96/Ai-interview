"use client";

import { useEffect, useRef, useState } from "react";
import Kicker from "@/components/ui/Kicker";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";

const MAX_ANSWER_LENGTH = 4000;

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Lives in components/ (not components/ui) because it's specific to
// answering an interview question — the mic wiring, submit button, and
// status copy are all about that one job. TextArea/Button/Kicker
// underneath stay generic.
export default function AnswerInput({ value, onChange, onSubmit, submitting }: AnswerInputProps) {
  // Feature-detected after mount, not at module scope — `window` doesn't
  // exist during this client component's server-rendered pass, and Safari
  // (and any other browser without Web Speech API support) should just
  // not see a mic button rather than seeing one that silently does
  // nothing when clicked.
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function startListening() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Snapshot whatever was already typed so voice input appends to it
    // instead of replacing it. Re-deriving the full transcript from
    // event.results on every event (rather than tracking interim vs final
    // separately) keeps the textarea updating live as the browser refines
    // its guess, with no extra state to get out of sync.
    const base = value.trim();
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onChange(base ? `${base} ${transcript}` : transcript);
    };
    recognition.onerror = (event) => {
      setVoiceNote(
        event.error === "not-allowed"
          ? "Microphone access was denied — check your browser's site permissions."
          : "Voice input stopped unexpectedly. You can keep typing instead."
      );
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceNote(null);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  const canSubmit = value.trim().length > 0 && !submitting;

  const statusText = isListening
    ? "Listening… speak your answer."
    : voiceNote
      ? voiceNote
      : submitting
        ? "Evaluating your answer…"
        : !speechSupported
          ? "Voice input isn't supported in this browser — you can still type your answer."
          : "Type or record your answer, then submit for feedback.";

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-6 text-left sm:p-8">
      <Kicker>Your answer</Kicker>

      {/* Stacked on mobile (mic button as a full-width bar below the
          textarea) rather than squeezed beside it — at a 375px-wide
          screen, a fixed 52px side-by-side mic button left the textarea
          under 220px wide. Side-by-side returns at sm and up, where
          there's room for both without cramping either. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextArea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={8}
          maxLength={MAX_ANSWER_LENGTH}
          disabled={submitting}
          placeholder="Type your answer, or use the microphone to talk through it…"
          className="flex-1"
          aria-label="Your answer"
        />
        {speechSupported && (
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={submitting}
            aria-label={isListening ? "Stop recording, listening now" : "Start voice input"}
            aria-pressed={isListening}
            className={`
              flex h-12 w-full shrink-0 items-center justify-center rounded-sm border
              transition-colors duration-200
              disabled:cursor-not-allowed disabled:opacity-50
              sm:h-[52px] sm:w-[52px]
              ${
                isListening
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-paper text-ink hover:border-accent"
              }
            `}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-5 w-5 ${isListening ? "animate-pulse" : ""}`}
            >
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 19v3" />
            </svg>
          </button>
        )}
      </div>

      <p aria-live="polite" className="min-h-[1rem] font-mono text-xs text-ink-soft">
        {statusText}
      </p>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
        className="sm:w-auto sm:self-end"
      >
        {submitting ? "Evaluating" : "Submit answer"}
      </Button>
    </div>
  );
}
