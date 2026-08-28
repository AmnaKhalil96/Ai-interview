// Covers the form's own logic: client-side validation before Firebase is
// ever called, the login/signup mode toggle, mapping a rejected auth call
// to a friendly on-screen message via getAuthErrorMessage, and a
// successful sign-in redirecting. signIn/signUp/signInWithGoogle are
// mocked — this suite never talks to Firebase.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "./LoginForm";

const mockPush = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signUp: (...args: unknown[]) => mockSignUp(...args),
    signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  };
});

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {},
}));
vi.mock("@/lib/firebase", () => ({ auth: {} }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("defaults to log-in mode", () => {
    render(<LoginForm />);

    expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
  });

  it("toggles to sign-up mode and back", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /need an account\? sign up/i }));
    expect(screen.getByRole("button", { name: /^sign up$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /already have an account\? log in/i }));
    expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
  });

  it("rejects an invalid email without calling Firebase", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("rejects a short password on sign-up without calling Firebase", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /need an account\? sign up/i }));
    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "abc");
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least/i);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("calls signIn with the entered credentials and redirects on success", async () => {
    mockSignIn.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(mockSignIn).toHaveBeenCalledWith("person@example.com", "password123");
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("shows a friendly message (not a raw Firebase error) when sign-in fails", async () => {
    mockSignIn.mockRejectedValueOnce({ code: "auth/wrong-password" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect email or password/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("calls signInWithGoogle and redirects on success", async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });
});
