import type { Config } from "tailwindcss";

// Design system tokens live here (not scattered as one-off hex codes in
// components) so the "deep focus / midnight" visual identity — charcoal-
// navy paper, off-white ink, a single lime accent — stays consistent
// everywhere and can be re-tuned from one place (see the values in
// globals.css).
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x) / <alpha-value>) — not a plain var() hex — is what
        // lets opacity modifiers like `bg-ink/30` or `ring-accent/10` work;
        // the CSS variables themselves hold "R G B" channels (globals.css).
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-raised": "rgb(var(--paper-raised) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
      },
      fontFamily: {
        // Display serif for headlines, grotesk for UI/body copy, mono for
        // small "editorial index" labels (kickers, numbers). Three families
        // with distinct jobs, not one generic system stack.
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      backgroundImage: {
        // Faint dot grid instead of a gradient blob — reads as a drafting
        // surface / notebook rather than a generic "AI startup" hero.
        dots: "radial-gradient(circle, rgb(var(--line)) 1px, transparent 1px)",
      },
      backgroundSize: {
        dots: "24px 24px",
      },
    },
  },
  plugins: [],
};
export default config;
