// Runs Lighthouse against a running production build, for both the public
// landing page and an authenticated page (/history), at both mobile and
// desktop form factors — the four combinations required for the capstone's
// performance audit (see docs/lighthouse-audit.md).
//
// Why a script instead of the `lighthouse` CLI directly: /history needs a
// signed-in Firebase session to render anything meaningful, and the CLI
// has no way to authenticate first. This launches one Chrome instance,
// signs up a throwaway test account in it with Puppeteer (real Firebase
// Auth, same approach as cypress/support/commands.ts), then points
// Lighthouse at that same already-authenticated browser via its
// remote-debugging port — Lighthouse reuses the session instead of
// hitting the login wall.
//
// Usage:
//   npm run build && npm run start          (in one terminal, port 3100)
//   npm run audit:lighthouse                 (in another)
// Reports land in lighthouse-results/*.json and *.html (open the .html
// files directly in a browser for the full readable report).
import { writeFileSync, mkdirSync } from "node:fs";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import puppeteer from "puppeteer-core";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const OUT_DIR = "lighthouse-results";

async function signUpTestAccount(browserURL) {
  const browser = await puppeteer.connect({ browserURL });
  const page = await browser.newPage();
  const email = `lighthouse-audit-${Date.now()}@example.com`;

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const toggle = [...document.querySelectorAll("button")].find((b) =>
      /need an account\? sign up/i.test(b.textContent ?? "")
    );
    toggle?.click();
  });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", "TestPassword123!");
  await page.evaluate(() => {
    const submit = [...document.querySelectorAll("button")].find((b) =>
      /^sign up$/i.test((b.textContent ?? "").trim())
    );
    submit?.click();
  });
  await page.waitForFunction(() => window.location.pathname === "/", { timeout: 10_000 });

  // Leave the session in the browser's cookies/IndexedDB; Lighthouse opens
  // its own tab in this same browser+profile next, so it inherits it.
  await page.close();
  await browser.disconnect();
}

async function runLighthouse(url, port, formFactor, label) {
  const isDesktop = formFactor === "desktop";
  const result = await lighthouse(
    url,
    { port, output: "json", logLevel: "error" },
    isDesktop ? desktopConfig : undefined
  );

  const { categories } = result.lhr;
  const scores = {
    performance: Math.round(categories.performance.score * 100),
    accessibility: Math.round(categories.accessibility.score * 100),
    bestPractices: Math.round(categories["best-practices"].score * 100),
    seo: Math.round(categories.seo.score * 100),
  };

  writeFileSync(`${OUT_DIR}/${label}.json`, result.report);
  // eslint-disable-next-line no-console
  console.log(
    `${label.padEnd(24)} Perf ${String(scores.performance).padStart(3)}  ` +
      `A11y ${String(scores.accessibility).padStart(3)}  ` +
      `BestPractices ${String(scores.bestPractices).padStart(3)}  ` +
      `SEO ${String(scores.seo).padStart(3)}`
  );
  return { label, url, formFactor, ...scores };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
  const browserURL = `http://localhost:${chrome.port}`;

  try {
    await signUpTestAccount(browserURL);

    const targets = [
      { path: "/", label: "landing" },
      { path: "/history", label: "history" },
    ];
    const formFactors = ["mobile", "desktop"];

    const allResults = [];
    for (const target of targets) {
      for (const formFactor of formFactors) {
        const label = `${target.label}-${formFactor}`;
        const result = await runLighthouse(`${BASE_URL}${target.path}`, chrome.port, formFactor, label);
        allResults.push(result);
      }
    }

    writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(allResults, null, 2));
    // eslint-disable-next-line no-console
    console.log(`\nFull reports + summary.json written to ${OUT_DIR}/`);
  } finally {
    await chrome.kill();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
