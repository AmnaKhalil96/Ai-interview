// /session and /history are auth-protected, so every E2E spec needs a
// signed-in user before it can reach them. Two options were considered:
// mocking Firebase Auth's network calls, or performing a real sign-up
// through the actual /login UI. Firestore is already left un-mocked in
// this suite (see practice-flow.cy.ts) because its SDK talks a
// session-negotiated WebChannel protocol that's impractical to fake
// correctly — Firebase Auth's popup/REST flow is more mockable in
// principle, but a real sign-up exercises the exact same account-creation
// path a real user hits (LoginForm's validation, lib/auth.ts, Firestore's
// per-uid security rule) end-to-end, which is what these tests are for.
// A fresh, randomly-generated email each run avoids collisions between
// runs (Firebase Auth would otherwise reject a duplicate email).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      signUp(): Chainable<void>;
    }
  }
}

Cypress.Commands.add("signUp", () => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  const password = "TestPassword123!";

  cy.visit("/login");
  cy.contains("button", /need an account\? sign up/i).click();
  cy.get("#email").type(email);
  cy.get("#password").type(password);
  cy.contains("button", /^sign up$/i).click();
  cy.location("pathname", { timeout: 10_000 }).should("eq", "/");
});

export {};
