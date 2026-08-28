import Kicker from "@/components/ui/Kicker";
import IndexItem from "@/components/ui/IndexItem";
import JobDescriptionForm from "@/components/JobDescriptionForm";

// This file stays a plain server component — the only interactive piece
// (the textarea + submit state) is isolated inside <JobDescriptionForm>,
// so the page itself doesn't need "use client" and everything else here
// ships as static markup.
export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-paper">
      {/* Faint dot grid instead of a gradient blob — a drafting-surface
          texture that fits the editorial identity without competing with
          the content on top of it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-dots bg-dots opacity-[0.35]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 sm:px-10">
        <section className="grid flex-1 grid-cols-1 items-center gap-16 py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-0">
          <div className="flex flex-col gap-8">
            <div className="animate-fade-up flex flex-col gap-6">
              <Kicker>AI interview coach</Kicker>
              <h1 className="max-w-xl font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
                Rehearse the interview you haven&apos;t had yet.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-ink-soft">
                Paste the job description below. InterviewIQ drafts
                behavioral and technical questions built for that exact
                role, then gives you structured feedback on every answer you
                give.
              </p>
            </div>

            <div className="animate-fade-up [animation-delay:100ms] flex flex-col">
              <IndexItem
                number="01"
                title="Paste the role"
                description="Drop in any job description — the more specific, the more tailored your questions."
              />
              <IndexItem
                number="02"
                title="Answer, out loud or written"
                description="Work through a mix of behavioral and technical questions built for that role."
              />
              <IndexItem
                number="03"
                title="See what to fix"
                description="Each answer comes back with a score, what worked, what's missing, and a stronger version."
              />
            </div>
          </div>

          <div className="lg:pt-4">
            <JobDescriptionForm />
          </div>
        </section>
      </div>
    </main>
  );
}
