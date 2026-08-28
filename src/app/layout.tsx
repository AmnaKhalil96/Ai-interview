import type { Metadata } from "next";
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

// Three Google fonts, each with one job, loaded once here and exposed as
// CSS variables so every component references the same three families
// instead of components picking their own fonts ad hoc.
// The `axes: ["opsz", "SOFT", "WONK"]` this used to request pulled in
// Fraunces's full variable-font axis ranges (its two largest files were
// 105KB/120KB) for optional letterform variations nothing in this app
// ever actually dials in via font-variation-settings — pure dead weight.
// A Lighthouse mobile audit measured this specifically: the biggest single
// layout shift on the landing page (CLS 0.233, "poor") was the serif
// headline reflowing when this oversized file finished loading and
// swapped in over the fallback font. Dropping the unused axes shrinks the
// font to just its weight axis, which next/font can match much more
// closely to a fallback's metrics.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// display: "optional" (not "swap") specifically for this font — a
// Lighthouse mobile audit traced the landing page's biggest layout shift
// (CLS 0.233, "poor") to IBM Plex Mono swapping in late, reflowing the
// small uppercase "kicker" labels used all over the app. Those labels are
// pure editorial styling, not content whose exact typeface matters the
// way the display/body fonts do, so it's a reasonable trade: "optional"
// gives the browser a ~100ms window to use the real font and otherwise
// commits to the fallback for the rest of the page load — no late swap,
// no shift, at the cost of occasionally showing the fallback monospace
// font instead of IBM Plex Mono on a slow connection.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "optional",
});

export const metadata: Metadata = {
  title: "InterviewIQ — Practice interviews that actually prepare you",
  description:
    "Paste a job description, answer tailored behavioral and technical questions, and get structured feedback on every response.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
