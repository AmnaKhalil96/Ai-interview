// Runs before every test file. Two jobs:
// 1. Extend Vitest's `expect` with jest-dom's DOM-specific matchers
//    (toBeDisabled, toHaveTextContent, etc.) so component tests can assert
//    on rendered output in plain English instead of manually inspecting
//    className strings or attributes.
// 2. Unmount and clean up the DOM after every test. React Testing
//    Library's own auto-cleanup only self-registers when it finds a
//    *global* afterEach (as Jest always provides) — this project
//    deliberately doesn't set `test.globals: true` in vitest.config.ts, so
//    without this, every render() in a file would pile up in the same
//    jsdom document and later tests would match multiple leftover copies.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
