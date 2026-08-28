// Firebase client setup. Kept isolated in lib/ so every call site imports
// `db` from here (see lib/sessions.ts) instead of calling initializeApp
// itself — if the project's Firebase config ever changes, this is the
// only file that changes.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Guard against re-initializing on every hot reload / re-render in Next.js.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const db: Firestore = getFirestore(app);

// Same Firebase app/project as Firestore — Auth needs no separate env vars.
//
// Deliberately `initializeAuth` (not the `getAuth` convenience wrapper):
// `getAuth` always wires in `browserPopupRedirectResolver`, and that
// resolver's `_shouldInitProactively` is true on every mobile browser and
// Safari — meaning it eagerly opens a hidden GAPI iframe
// (apis.google.com/.../gapi_iframes/...) on *every* page load on mobile,
// even pages like /history that never call signInWithPopup. Measured via
// Lighthouse's bootup-time audit (~178ms) on /history-mobile. Omitting the
// resolver here removes that proactive init; signInWithGoogle() in
// lib/auth.ts supplies the resolver explicitly, only when a popup sign-in
// is actually requested. See docs/lighthouse-audit.md.
const auth: Auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});

export { app, db, auth };
