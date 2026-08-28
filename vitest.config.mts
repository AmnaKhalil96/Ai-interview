import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const rootDir = import.meta.dirname;

// Vite-native config (not next/jest) — Next.js 14's own Jest wrapper adds a
// layer of Next-specific transform config we don't need here, since
// everything under test (lib/, components/) is plain React/TypeScript with
// no App Router server-only APIs. Vitest + jsdom is lighter and faster for
// that.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
      // firebase.ts is excluded on purpose: it's pure third-party SDK
      // initialization (initializeApp/getFirestore) with no branching logic
      // of ours — a test for it would only assert that we called the
      // Firebase SDK, not that anything we wrote behaves correctly.
      exclude: ["src/lib/firebase.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
