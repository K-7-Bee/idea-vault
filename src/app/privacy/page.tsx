import type { Metadata } from "next";
import Link from "next/link";
import ProjectsFrame from "../projects/frame";

// Phase 6D: the privacy page Google's brand verification needs before the Drive OAuth app can be
// published. Every statement here describes what the code and settings actually do (checked
// 2026-11-23); change it together with the code. The owner approves the wording before go-live.
export const metadata: Metadata = {
  title: "Privacy",
  description: "What this site collects, what the private Idea Vault stores, and how Google Drive data is used.",
};

const UPDATED = "23 November 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-nav text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-pf-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <ProjectsFrame>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">How this site handles data</p>
        <h1 className="font-nav mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Privacy</h1>
        <p className="mt-5 text-lg leading-relaxed text-pf-muted">
          This is MD Kaushik Kamal&apos;s personal website. It has two parts: the public portfolio, and Idea Vault, a
          private workspace that only the site&apos;s owner can sign in to. Last updated {UPDATED}.
        </p>

        <Section title="If you visit the portfolio">
          <p>
            The public pages don&apos;t use analytics, advertising, tracking scripts or cookies, and they don&apos;t ask you
            for any information.
          </p>
          <p>
            The site is hosted by Vercel. Like any web host, Vercel receives standard request details (such as your IP
            address, browser type and the page requested) to serve the site, and keeps them in its logs for a limited
            time under its own privacy policy. This site doesn&apos;t use those logs to identify visitors.
          </p>
          <p>
            If your browser blocks something because of this site&apos;s security policy, it may send a short report. The
            site records only which rule was triggered and the website address that was blocked, nothing about you.
          </p>
        </Section>

        <Section title="Idea Vault (owner only)">
          <p>
            Idea Vault has a single account, the owner&apos;s. Signing in sets a login cookie for that account. The
            owner&apos;s ideas, projects, notes and files are stored with Supabase (database and file storage) and are
            protected so that only the owner&apos;s account can read or change them. In the owner&apos;s own browser, the
            Vault keeps unsent ideas and drafts so it can work offline until they are saved.
          </p>
          <p>
            Nothing from the Vault is public unless the owner chooses to publish a finished project, journal entry or
            profile text to the portfolio.
          </p>
        </Section>

        <Section title="Google Drive">
          <p>
            The owner can connect their own Google Drive to Idea Vault to keep attachments there. The connection uses
            Google&apos;s <code className="text-pf-ink">drive.file</code> permission, which only covers files that Idea
            Vault creates or that the owner picks with Google&apos;s file picker. Idea Vault can&apos;t see anything else
            in the Drive.
          </p>
          <p>
            The data received from Google (the account&apos;s email address, to check it&apos;s the owner&apos;s account,
            and those files, with details such as their name, type and size) is used only to store, list, show and remove the
            owner&apos;s own attachments inside the Vault. It isn&apos;t sold, shared with anyone, used for advertising,
            or used to train AI models. Google&apos;s access tokens are stored encrypted, and can be revoked at any time
            by disconnecting in the Vault&apos;s Settings or in the Google Account&apos;s security settings.
          </p>
          <p>
            Idea Vault&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a className="text-pf-blue underline underline-offset-4" href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="The assistant (owner only, optional)">
          <p>
            The Vault has an optional assistant that is switched off unless the owner turns it on. When it is on, it
            sends only the records the owner ticks for a question to Google&apos;s Gemini API to get an answer. It never
            sends Google Drive file contents.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            The owner can delete any of their records, download a copy of them from Settings, and disconnect Google
            Drive at any time. Encrypted backups are kept privately by the owner.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this page: use the <Link className="text-pf-blue underline underline-offset-4" href="/#contact">contact details on the homepage</Link>.
          </p>
        </Section>
      </main>
    </ProjectsFrame>
  );
}
