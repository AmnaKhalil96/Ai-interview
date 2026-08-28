// Runs before every E2E spec. Nothing project-specific needed yet — kept
// as the standard Cypress support entry point rather than deleted, so
// adding a global custom command or hook later doesn't require wiring a
// new file into cypress.config.ts.
import "./commands";
