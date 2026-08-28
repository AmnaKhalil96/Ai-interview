// Covers getAuthErrorMessage's error-code -> friendly-message mapping —
// the one piece of real logic in this module worth testing in isolation.
// signUp/signIn/signInWithGoogle/signOutUser are thin one-line passthroughs
// to the Firebase SDK (see auth.ts); testing them would mean re-testing
// Firebase's own functions with mocks standing in for all the real logic,
// which verifies nothing. firebase/auth and lib/firebase are mocked here
// only so importing this module doesn't try to initialize a real Firebase
// app under jsdom.
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {},
}));
vi.mock("@/lib/firebase", () => ({ auth: {} }));

import { getAuthErrorMessage, MIN_PASSWORD_LENGTH } from "./auth";

describe("getAuthErrorMessage", () => {
  it("maps auth/email-already-in-use to a friendly message", () => {
    expect(getAuthErrorMessage({ code: "auth/email-already-in-use" })).toMatch(
      /already exists/i
    );
  });

  it("maps auth/wrong-password, auth/user-not-found, and auth/invalid-credential to the same generic message", () => {
    const wrongPassword = getAuthErrorMessage({ code: "auth/wrong-password" });
    const userNotFound = getAuthErrorMessage({ code: "auth/user-not-found" });
    const invalidCredential = getAuthErrorMessage({ code: "auth/invalid-credential" });

    // Deliberately identical: revealing which half (email vs. password) was
    // wrong is a user-enumeration leak, not a helpful error detail.
    expect(wrongPassword).toBe(userNotFound);
    expect(userNotFound).toBe(invalidCredential);
    expect(wrongPassword).toMatch(/incorrect email or password/i);
  });

  it("includes the configured minimum length in the weak-password message", () => {
    expect(getAuthErrorMessage({ code: "auth/weak-password" })).toContain(
      String(MIN_PASSWORD_LENGTH)
    );
  });

  it("maps auth/popup-closed-by-user to a cancellation message, not an error", () => {
    expect(getAuthErrorMessage({ code: "auth/popup-closed-by-user" })).toMatch(/cancelled/i);
  });

  it("falls back to a generic message for an unrecognized error code", () => {
    expect(getAuthErrorMessage({ code: "auth/some-new-error-code" })).toBe(
      "Something went wrong. Please try again."
    );
  });

  it("falls back to a generic message when given something that isn't a Firebase error", () => {
    expect(getAuthErrorMessage(new Error("plain error"))).toBe(
      "Something went wrong. Please try again."
    );
    expect(getAuthErrorMessage("a string")).toBe("Something went wrong. Please try again.");
    expect(getAuthErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
