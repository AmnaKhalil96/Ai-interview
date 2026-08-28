// Covers the radio-group contract: all three options render with the
// selected one checked, clicking an option calls onChange with its value
// (not the previously selected one), and the whole group is keyboard
// operable and disable-able via the underlying native radio inputs.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DifficultySelector from "./DifficultySelector";

describe("DifficultySelector", () => {
  it("renders all three difficulty options", () => {
    render(<DifficultySelector value="mid" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Entry" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mid" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Senior" })).toBeInTheDocument();
  });

  it("marks only the current value's radio as checked", () => {
    render(<DifficultySelector value="senior" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Senior" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Entry" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Mid" })).not.toBeChecked();
  });

  it("calls onChange with the clicked option's value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DifficultySelector value="mid" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Senior" }));

    expect(onChange).toHaveBeenCalledWith("senior");
  });

  it("is keyboard operable via native radio semantics", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DifficultySelector value="entry" onChange={onChange} />);

    screen.getByRole("radio", { name: "Entry" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("mid");
  });

  it("disables every option when disabled is passed", () => {
    render(<DifficultySelector value="mid" onChange={vi.fn()} disabled />);

    expect(screen.getByRole("radio", { name: "Entry" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Mid" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Senior" })).toBeDisabled();
  });
});
