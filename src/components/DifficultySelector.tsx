import { DIFFICULTIES } from "@/lib/difficulty";
import type { Difficulty } from "@/types";

interface DifficultySelectorProps {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  disabled?: boolean;
}

// Real <input type="radio"> elements, visually hidden behind styled
// <label>s, rather than a hand-rolled role="radiogroup" built from
// <button>s — this gets arrow-key navigation between the three options,
// "2 of 3" screen reader announcements, and native single-selection
// behavior for free from the browser, instead of reimplementing all of
// that by hand. Matches this app's general preference for wrapping real
// form elements (see ui/TextArea, ui/Input) over building custom widgets.
export default function DifficultySelector({ value, onChange, disabled }: DifficultySelectorProps) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:cursor-not-allowed disabled:opacity-60">
      <legend className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
        Difficulty
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {DIFFICULTIES.map((option) => (
          <label
            key={option.value}
            className="
              flex min-h-[44px] cursor-pointer items-center justify-center rounded-sm border border-line
              px-3 py-3 font-sans text-sm text-ink-soft
              transition-colors duration-200
              hover:border-accent
              has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper
            "
          >
            <input
              type="radio"
              name="difficulty"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
