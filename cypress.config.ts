import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // Next's default `npm run dev` port. If it's already busy on a given
    // machine (Next falls back to 3001, 3002, ...), override at the CLI
    // with `cypress run --config baseUrl=http://localhost:3001` rather than
    // changing this file.
    baseUrl: "http://localhost:3000",
    // `next dev` compiles each route on the first request that hits it —
    // observed taking several seconds for this app's first
    // /api/generate-questions call against a freshly-started server.
    // Cypress's 4s default was enough to make that one cold request
    // intermittently fail. Running against a production build
    // (`npm run build && npm run start`) avoids this entirely since
    // everything is precompiled; this timeout is a safety net for running
    // the suite against `next dev` too.
    defaultCommandTimeout: 10_000,
    setupNodeEvents() {
      // No custom tasks/plugins needed yet — both E2E specs mock the
      // Gemini-backed API routes with cy.intercept from the browser side.
      // Firestore and Firebase Auth are deliberately left real (see the
      // comments in practice-flow.cy.ts and support/commands.ts), so
      // there's nothing for the Node side of Cypress to do either way.
    },
  },
});
