// Covers: the submit button's enabled/disabled contract (empty vs
// non-empty text, and while submitting), that clicking it actually calls
// onSubmit, the Web-Speech-API-unsupported fallback (jsdom has no
// SpeechRecognition by default, so this is the natural "unsupported"
// environment — the same as real Safari), and — with a minimal mocked
// SpeechRecognition constructor — that the mic button appears and toggles
// listening state when the API *is* available. No real speech recognition
// or network activity is involved.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnswerInput from "./AnswerInput";

function renderInput(overrides: Partial<React.ComponentProps<typeof AnswerInput>> = {}) {
  const props = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    submitting: false,
    ...overrides,
  };
  const utils = render(<AnswerInput {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe("AnswerInput", () => {
  it("disables the submit button when the answer is empty", () => {
    renderInput({ value: "" });

    expect(screen.getByRole("button", { name: /submit answer/i })).toBeDisabled();
  });

  it("disables the submit button when the answer is only whitespace", () => {
    renderInput({ value: "   " });

    expect(screen.getByRole("button", { name: /submit answer/i })).toBeDisabled();
  });

  it("enables the submit button once there is text", () => {
    renderInput({ value: "My answer" });

    expect(screen.getByRole("button", { name: /submit answer/i })).toBeEnabled();
  });

  it("calls onSubmit when the submit button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderInput({ value: "My answer" });

    await user.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not call onSubmit when the disabled (empty) button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderInput({ value: "" });

    await user.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("shows an evaluating state and disables the textarea while submitting", () => {
    renderInput({ value: "My answer", submitting: true });

    expect(screen.getByRole("button", { name: /evaluating/i })).toBeDisabled();
    expect(screen.getByLabelText(/your answer/i)).toBeDisabled();
  });

  it("calls onChange with the new value when the textarea is typed into", async () => {
    const user = userEvent.setup();
    const { props } = renderInput({ value: "" });

    await user.type(screen.getByLabelText(/your answer/i), "a");

    expect(props.onChange).toHaveBeenCalledWith("a");
  });

  describe("when the Web Speech API is unavailable", () => {
    it("does not render a microphone button", () => {
      renderInput();

      expect(screen.queryByRole("button", { name: /voice input/i })).not.toBeInTheDocument();
    });

    it("tells the user voice input isn't supported", () => {
      renderInput();

      expect(screen.getByText(/voice input isn't supported in this browser/i)).toBeInTheDocument();
    });
  });

  describe("when the Web Speech API is available", () => {
    let instances: MockSpeechRecognition[] = [];

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        instances.push(this);
      }
    }

    function withMockedSpeechRecognition() {
      instances = [];
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockSpeechRecognition;
    }

    function latestInstance() {
      return instances[instances.length - 1];
    }

    it("renders a microphone button with an accessible label", async () => {
      withMockedSpeechRecognition();
      renderInput();

      expect(await screen.findByRole("button", { name: "Start voice input" })).toBeInTheDocument();
    });

    it("starts recognition and flips to the listening state when clicked", async () => {
      withMockedSpeechRecognition();
      const user = userEvent.setup();
      renderInput();

      const micButton = await screen.findByRole("button", { name: "Start voice input" });
      await user.click(micButton);

      expect(screen.getByRole("button", { name: "Stop recording, listening now" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByText(/listening… speak your answer/i)).toBeInTheDocument();
    });

    it("stops recognition and returns to the idle state when clicked again", async () => {
      withMockedSpeechRecognition();
      const user = userEvent.setup();
      renderInput();

      const micButton = await screen.findByRole("button", { name: "Start voice input" });
      await user.click(micButton);
      await user.click(screen.getByRole("button", { name: "Stop recording, listening now" }));

      expect(screen.getByRole("button", { name: "Start voice input" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("shows a permission-denied note and stops listening when the mic is blocked", async () => {
      withMockedSpeechRecognition();
      const user = userEvent.setup();
      renderInput();

      await user.click(await screen.findByRole("button", { name: "Start voice input" }));
      act(() => latestInstance().onerror?.({ error: "not-allowed" }));

      expect(screen.getByText(/microphone access was denied/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start voice input" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("shows a generic note when recognition fails for any other reason", async () => {
      withMockedSpeechRecognition();
      const user = userEvent.setup();
      renderInput();

      await user.click(await screen.findByRole("button", { name: "Start voice input" }));
      act(() => latestInstance().onerror?.({ error: "network" }));

      expect(screen.getByText(/voice input stopped unexpectedly/i)).toBeInTheDocument();
    });

    it("returns to the idle state if recognition ends on its own", async () => {
      withMockedSpeechRecognition();
      const user = userEvent.setup();
      renderInput();

      await user.click(await screen.findByRole("button", { name: "Start voice input" }));
      act(() => latestInstance().onend?.());

      expect(screen.getByRole("button", { name: "Start voice input" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });
  });
});
