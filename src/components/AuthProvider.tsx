"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

// App-wide auth state, following the same pattern as every other Firebase
// integration in this app: one module owns the SDK specifics
// (onAuthStateChanged here), everything else consumes a plain hook.
// `loading` starts true so pages can tell "we haven't heard from Firebase
// yet" apart from "Firebase confirmed you're logged out" — collapsing those
// would flash a sign-in prompt at every already-logged-in user on refresh
// before the redirect/session check has a real answer.
interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
