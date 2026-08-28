/// <reference types="cypress" />

// Covers the failure path the happy-path spec doesn't: when an AI call
// fails, the app should show the styled error box (not a raw error page or
// a silent hang) with a "Try again" button that both preserves whatever
// the user already typed and actually recovers on retry. Only
// /api/evaluate-answer is exercised here since it shares its error-UI
// pattern with /api/generate-questions (same AIGenerationError shape, same
// error component), so this one spec stands in for both without
// duplicating the same assertions twice.
describe("practice session — evaluation error path", () => {
  const jobDescription =
    "We are hiring a Senior Backend Engineer to design and scale our payments infrastructure, mentor junior engineers, and partner with product on API scoping.";

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept("POST", "/api/generate-questions", { fixture: "questions.json" }).as("generate");
  });

  it("shows the error box on failure and recovers when the user retries", () => {
    cy.intercept("POST", "/api/evaluate-answer", {
      statusCode: 502,
      body: { error: "The AI request failed. Please try again in a moment." },
    }).as("evaluateFailed");

    // /session is auth-protected — sign up a fresh test account first (see
    // cypress/support/commands.ts for why this is a real sign-up rather
    // than a mocked one).
    cy.signUp();
    cy.get("#job-description").type(jobDescription, { delay: 0 });
    cy.contains("button", "Start practice").click();
    cy.wait("@generate");

    const answerField = () => cy.get('[aria-label="Your answer"]');
    answerField().type("An answer that will fail to evaluate.", { delay: 0 });
    cy.contains("button", "Submit answer").click();
    cy.wait("@evaluateFailed");

    cy.contains("Couldn't evaluate your answer.").should("be.visible");
    cy.contains("The AI request failed. Please try again in a moment.").should("be.visible");
    // The failed answer is still in the textarea, not lost.
    answerField().should("have.value", "An answer that will fail to evaluate.");

    cy.intercept("POST", "/api/evaluate-answer", { fixture: "feedback.json" }).as("evaluateRetry");
    cy.contains("button", "Try again").click();
    cy.wait("@evaluateRetry");

    cy.contains("Couldn't evaluate your answer.").should("not.exist");
    cy.contains("Score").should("be.visible");
    cy.contains("button", "Next question").should("be.visible");
  });
});
