// All Firebase Auth-specific code (provider setup, the error-code -> message
// map) stays in this one module — the rest of the app calls signUp/signIn/
// signInWithGoogle/signOutUser and only ever sees a plain Error with a
// friendly message, the same isolation approach lib/firebase.ts and
// lib/sessions.ts already use for the rest of the Firebase SDK.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export const MIN_PASSWORD_LENGTH = 6;

const googleProvider = new GoogleAuthProvider();

export function signUp(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signIn(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle(): Promise<UserCredential> {
  // Passing the resolver here (rather than baking it into lib/firebase.ts's
  // Auth instance) keeps its proactive GAPI iframe load scoped to the
  // moment a popup sign-in is actually requested, not every page load.
  return signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

// Firebase's own error messages ("Firebase: Error (auth/wrong-password).")
// are implementation details, not something to show a user. This maps the
// stable `code` field to copy that matches the rest of the app's error
// tone. Deliberately gives "wrong-password", "user-not-found", and
// "invalid-credential" the identical message — telling an attacker which
// half was wrong (a real email with a bad password vs. no such account) is
// a user-enumeration leak, not a helpful detail.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists — try logging in instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/weak-password": `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Couldn't reach the server. Check your connection and try again.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
};

export function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return AUTH_ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
