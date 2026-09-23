"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type EmailPreview = {
  id: string;
  label: string;
  recipient: string;
  subject: string;
  html: string;
  text: string | null;
};

export default function BetaEmailsPreview({ emails }: { emails: EmailPreview[] }) {
  const [selectedId, setSelectedId] = useState(emails[0]?.id);
  const [format, setFormat] = useState<"html" | "text">("html");
  const [mobile, setMobile] = useState(false);
  const selected = emails.find((email) => email.id === selectedId) ?? emails[0];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 text-foreground sm:px-10">
      <p className="text-sm text-muted-foreground">Verkli / Email preview</p>
      <h1 className="mt-4 font-display text-3xl font-medium tracking-tight sm:text-4xl">From waiting to welcome.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Check the invitation for each audience and account state, alongside the waiting confirmation. Preview only. No emails are sent.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Email examples" className="flex flex-col gap-2">
          {emails.map((email) => (
            <button
              key={email.id}
              type="button"
              aria-pressed={selected?.id === email.id}
              onClick={() => setSelectedId(email.id)}
              className={`min-h-11 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === email.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}
            >
              {email.label}
            </button>
          ))}
        </nav>

        {selected ? (
          <section aria-label="Selected email" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-5">
              <p className="text-xs text-muted-foreground">To: {selected.recipient}</p>
              <h2 className="mt-2 text-lg font-medium">{selected.subject}</h2>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={format === "html" ? "primary" : "secondary"} aria-pressed={format === "html"} onClick={() => setFormat("html")}>Email</Button>
                <Button size="sm" variant={format === "text" ? "primary" : "secondary"} aria-pressed={format === "text"} onClick={() => setFormat("text")}>Plain text</Button>
                <Button size="sm" variant="secondary" aria-pressed={mobile} onClick={() => setMobile((value) => !value)} className="sm:ml-auto">{mobile ? "Mobile width" : "Desktop width"}</Button>
              </div>
            </div>
            {format === "html" ? (
              <div className="bg-background p-2 sm:p-4">
                <iframe
                  key={selected.id}
                  title={`${selected.label} email`}
                  srcDoc={selected.html}
                  sandbox=""
                  className={`mx-auto block h-[1050px] w-full border-0 bg-card ${mobile ? "max-w-[390px]" : ""}`}
                />
              </div>
            ) : selected.text ? (
              <pre className="whitespace-pre-wrap break-words px-5 py-6 font-sans text-sm leading-7">{selected.text}</pre>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">This waiting confirmation currently has an HTML version only. Choose Email to preview it.</p>
            )}
          </section>
        ) : (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No email examples are available.</p>
        )}
      </div>
    </main>
  );
}
