/// <reference types="cypress" />

// End-to-end coverage of the app's one critical path: pick a difficulty,
// paste a job description -> generate questions -> answer all 5 (retrying
// one along the way) -> see AI feedback each time -> reach the summary
// screen -> confirm the finished session shows up in history.
//
// /api/generate-questions and /api/evaluate-answer (the two Gemini-backed
// routes) are intercepted with fixture data, per the project's testing
// plan, so this test is fast, deterministic, and never depends on a live
// LLM response.
//
// Firestore (the session save on finish, and the fetch on the history
// page) and Firebase Auth (the sign-up at the start, via cy.signUp()) are
// deliberately NOT intercepted — see cypress/support/commands.ts and the
// original trade-off note this comment used to carry: Firestore's SDK
// talks a session-negotiated WebChannel protocol that's impractical to
// fake at the network layer, and a real sign-up exercises the same
// account-creation path a real user hits. Both are plain, low-latency
// services (unlike the variable-latency LLM calls), so leaving them real
// doesn't reintroduce the flakiness that motivated mocking Gemini. The
// trade-off: this test requires a real, already-configured Firebase
// project (see .env.local) and writes one real user + one real document to
// the "sessions" collection each time it runs.
describe("practice session — happy path", () => {
  const jobDescription =
    "We are hiring a Senior Backend Engineer to design and scale our payments infrastructure, mentor junior engineers, and partner with product on API scoping.";

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept("POST", "/api/generate-questions", { fixture: "questions.json" }).as("generate");
    cy.intercept("POST", "/api/evaluate-answer", { fixture: "feedback.json" }).as("evaluate");
  });

  it("walks through all 5 questions (retrying one), reaches the summary screen, and the finished session appears in history", () => {
    // /session and /history are auth-protected — sign up a fresh test
    // account first (see cypress/support/commands.ts for why this is a
    // real sign-up rather than a mocked one).
    cy.signUp();

    cy.get("#job-description").type(jobDescription, { delay: 0 });
    // Exercises the difficulty selector (Feature 2) end to end — clicking
    // the visible label, since the radio input itself is visually hidden
    // (sr-only) behind it.
    cy.contains("label", "Senior").click();
    cy.contains("button", "Start practice").click();
    cy.wait("@generate");
    cy.get("@generate").its("request.body.difficulty").should("eq", "senior");

    cy.location("pathname").should("eq", "/session");
    cy.contains("Question 1 of 5").should("be.visible");
    cy.contains("Senior").should("be.visible");

    // FEATURE 1: retry the first question before moving on. Answering,
    // retrying, and re-answering should leave exactly one submission for
    // this question in the eventual saved session (asserted implicitly:
    // the history page below shows this session with exactly 5 questions,
    // not 6, and the retry's throwaway answer is never seen again).
    cy.get('[aria-label="Your answer"]').type("A throwaway first attempt.", { delay: 0 });
    cy.contains("button", "Submit answer").click();
    cy.wait("@evaluate");
    cy.contains("button", "Retry this question").click();
    cy.get('[aria-label="Your answer"]').should("have.value", "");
    cy.contains("button", "Submit answer").should("be.visible");

    for (let questionNumber = 1; questionNumber <= 5; questionNumber++) {
      cy.contains(`Question ${questionNumber} of 5`).should("be.visible");

      cy.get('[aria-label="Your answer"]').type(`My answer to question ${questionNumber}.`, {
        delay: 0,
      });
      cy.contains("button", "Submit answer").click();
      cy.wait("@evaluate");

      // Feedback is on screen: the score ring and at least one strength.
      cy.contains("Score").should("be.visible");
      cy.contains("Uses clear first-person language").should("be.visible");

      // FEATURE 4: copy feedback — exercised once, on the first question,
      // rather than all five, since it's the same component every time.
      // Asserts the visible + accessible confirmation only; verifying the
      // actual OS clipboard contents needs CDP permissions that don't
      // reliably work in Cypress's Electron runner, so that's covered by
      // CopyFeedbackButton.test.tsx (asserting the real clipboard API is
      // called with the exact expected text) plus manual verification.
      if (questionNumber === 1) {
        cy.contains("button", "Copy feedback").click();
        cy.contains("button", "Copied!").should("be.visible");
      }

      if (questionNumber < 5) {
        cy.contains("button", "Next question").click();
      } else {
        cy.contains("button", "Finish session").click();
      }
    }

    // FEATURE 3: the summary screen — overall average score, the
    // aggregated one-line summary, and the per-question breakdown — is
    // reached instead of a bare "nice work" message.
    cy.contains("Session complete").should("be.visible");
    cy.contains("Average score").should("be.visible");
    // The aggregated one-line summary (Feature 3) reuses text straight
    // from the feedback fixture — every question scores identically here,
    // so the same strength appears in both the summary and the per-answer
    // feedback above.
    cy.contains("Uses clear first-person language").should("be.visible");
    cy.get("li").contains("How would you design idempotent payment endpoints").should("be.visible");

    cy.contains("button", "View in history").click();

    cy.location("pathname").should("eq", "/history");
    cy.contains(jobDescription.slice(0, 60)).should("be.visible");
    cy.contains("5 questions").should("be.visible");
    cy.contains("Senior").should("be.visible");
  });
});
