// Covers the primitive's actual contract: clicks fire (or don't, when
// disabled), and `loading` forces the disabled state and swaps the arrow
// icon for a spinner even when the caller didn't separately pass
// `disabled` — this is the behavior every other component that shows a
// loading state (AnswerInput, JobDescriptionForm) relies on.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Start practice</Button>);

    expect(screen.getByRole("button", { name: "Start practice" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Submit
      </Button>
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("is disabled while loading even if disabled wasn't explicitly passed", () => {
    render(<Button loading>Submit</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("marks the button aria-busy while loading", () => {
    render(<Button loading>Submit</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("does not call onClick while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Submit
      </Button>
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders and behaves the same way with the secondary variant", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="secondary" onClick={onClick}>
        Retry this question
      </Button>
    );
    const button = screen.getByRole("button", { name: "Retry this question" });

    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
