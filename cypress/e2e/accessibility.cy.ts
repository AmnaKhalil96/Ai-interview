/// <reference types="cypress" />
import "cypress-axe";
import type { Result } from "axe-core";

// Accessibility audit spec — runs the full axe-core rule set (every WCAG
// 2.0/2.1 A + AA rule, plus axe's "best-practice" rules like heading-order
// and page-has-heading-one, which caught two real issues WCAG's rule tags
// alone don't cover) against every page and major UI state in the app.
// This is the evidence behind docs/accessibility-audit.md. Re-run any time
// with:
//   npm run build && npm run start   (in one terminal)
//   npx cypress run --spec cypress/e2e/accessibility.cy.ts   (in another)
// or interactively with `npx cypress open`.
//
// Firestore/Firebase Auth are left real (see support/commands.ts) and the
// two Gemini-backed routes are fixture-mocked, matching the rest of this
// project's E2E strategy — axe only cares about the rendered DOM, so
// there's no accessibility-relevant difference between real and mocked AI
// responses here.
const jobDescription =
  "We are hiring a Senior Backend Engineer to design and scale our payments infrastructure, mentor junior engineers, and partner with product on API scoping.";

// Collected across the whole run and dumped once at the end so a single
// spec run produces one complete report instead of failing on the first
// page that has a problem — see docs/accessibility-audit.md for how this
// was used during the actual audit.
const allViolations: Array<{ page: string; violations: Result[] }> = [];

function checkA11y(pageLabel: string) {
  cy.injectAxe();
  cy.checkA11y(
    undefined,
    undefined, // no runOnly filter — the full rule set, see the header comment
    (violations) => {
      if (violations.length > 0) {
        allViolations.push({ page: pageLabel, violations });
      }
    },
    true // don't fail immediately — every page gets checked in one run; the
    // final assertion below is what actually fails the test on a regression.
  );
}

describe("accessibility audit (axe-core, full rule set)", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept("POST", "/api/generate-questions", { fixture: "questions.json" }).as("generate");
    cy.intercept("POST", "/api/evaluate-answer", { fixture: "feedback.json" }).as("evaluate");
  });

  it("audits every page and major UI state", () => {
    // Landing page, signed out (the sign-in-prompt panel).
    cy.visit("/");
    // The landing page's entrance animation (animate-fade-up) fades from
    // opacity:0, which transiently drops every element's effective
    // contrast to near-zero for its ~900ms duration — axe caught this as
    // a "serious" color-contrast violation on an early run. That's a real
    // finding about the instant checked, not a real bug: the settled
    // page (what a user actually reads) uses the same bg-ink/text-paper
    // pair used everywhere else, already verified at ~14.7:1 contrast.
    // Waiting for the animation to finish before checking is what a human
    // auditor does by default, so this is the correct check, not a
    // weakened one. See docs/accessibility-audit.md for the full writeup.
    cy.wait(1000);
    checkA11y("landing (signed out)");

    // Login page, both modes, plus a validation error shown.
    cy.visit("/login");
    checkA11y("login (log in mode)");
    cy.contains("button", /need an account\? sign up/i).click();
    checkA11y("login (sign up mode)");
    cy.contains("button", /^sign up$/i).click(); // submit empty -> validation error
    checkA11y("login (validation error shown)");

    // Real sign-up to reach the authenticated pages.
    const email = `e2e-a11y-${Date.now()}@example.com`;
    cy.get("#email").clear().type(email);
    cy.get("#password").clear().type("TestPassword123!");
    cy.contains("button", /^sign up$/i).click();
    cy.location("pathname", { timeout: 10_000 }).should("eq", "/");

    // Landing page, signed in, empty form.
    checkA11y("landing (signed in, empty form)");

    // Landing page, filled in with a difficulty picked.
    cy.get("#job-description").type(jobDescription, { delay: 0 });
    cy.contains("label", "Senior").click();
    checkA11y("landing (signed in, filled form)");

    cy.contains("button", "Start practice").click();
    cy.wait("@generate");
    cy.location("pathname").should("eq", "/session");
    checkA11y("session (question view)");

    // Answer, then retry, then answer again — covers the retry button and
    // the reset-to-question-view state, not just the two steady states.
    cy.get('[aria-label="Your answer"]').type("A sample answer for the audit.", { delay: 0 });
    cy.contains("button", "Submit answer").click();
    cy.wait("@evaluate");
    checkA11y("session (feedback view)");

    cy.contains("button", "Retry this question").click();
    // Focus management check: axe can't detect this (it inspects static
    // DOM, not the sequence of interactions), but it's exactly the kind
    // of thing that leaves a keyboard/screen-reader user stranded if
    // wrong. Retry doesn't navigate or change the URL, so nothing else
    // moves focus for us — the question heading must do it itself.
    cy.focused().should("contain.text", "Tell me about a time you owned an incident");
    checkA11y("session (after retry, back to question view)");

    for (let questionNumber = 1; questionNumber <= 5; questionNumber++) {
      cy.get('[aria-label="Your answer"]').type(`Sample answer ${questionNumber}.`, { delay: 0 });
      cy.contains("button", "Submit answer").click();
      cy.wait("@evaluate");
      if (questionNumber < 5) {
        cy.contains("button", "Next question").click();
        // Same focus-management check as the retry case above, this time
        // for advancing — and specifically that it lands on the NEW
        // question's heading (not just "still focused on something"),
        // confirming the ref points at freshly-rendered content each time.
        cy.get("h1").should("have.focus").and("not.contain.text", "owned an incident");
      } else {
        cy.contains("button", "Finish session").click();
        // Session-complete is a bigger jump than Next/Retry (a whole new
        // screen, not just new question text), so it gets its own
        // heading and its own focus target — verified the same way.
        cy.focused().should("contain.text", "Session complete");
      }
    }

    checkA11y("session (summary screen)");

    cy.contains("button", "View in history").click();
    cy.location("pathname").should("eq", "/history");
    checkA11y("history (list view)");

    cy.get("ul li button").first().click();
    checkA11y("history (expanded, with feedback)");

    // Persist + print the full report regardless of pass/fail, then make
    // the test's own result mean what it should: zero pages with any
    // violation at all.
    cy.then(() => {
      // eslint-disable-next-line no-console
      console.log(`\n=== ACCESSIBILITY AUDIT: ${allViolations.length} page(s) with violations ===`);
      for (const { page, violations } of allViolations) {
        // eslint-disable-next-line no-console
        console.log(`\n--- ${page} (${violations.length} violation type(s)) ---`);
        for (const v of violations) {
          // eslint-disable-next-line no-console
          console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
          for (const node of v.nodes) {
            // eslint-disable-next-line no-console
            console.log(`    ${node.target.join(" ")}`);
          }
        }
      }
    });
    cy.writeFile("cypress/a11y-results.json", allViolations);
    cy.wrap(allViolations).should("have.length", 0);
  });
});
