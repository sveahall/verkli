"use client";

import { useState, type FormEvent } from "react";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reportId: string | null }
  | { kind: "error"; message: string };

export default function DmcaForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      fullName: String(data.get("fullName") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim() || undefined,
      address: String(data.get("address") ?? "").trim(),
      representingCapacity: data.get("representingCapacity") === "authorized_agent"
        ? "authorized_agent"
        : "self",
      copyrightedWorkTitle: String(data.get("copyrightedWorkTitle") ?? "").trim(),
      copyrightedWorkUrl: String(data.get("copyrightedWorkUrl") ?? "").trim() || undefined,
      infringingUrl: String(data.get("infringingUrl") ?? "").trim(),
      infringingDescription: String(data.get("infringingDescription") ?? "").trim(),
      goodFaithStatement: data.get("goodFaithStatement") === "on" ? true : undefined,
      accuracyStatement: data.get("accuracyStatement") === "on" ? true : undefined,
      signature: String(data.get("signature") ?? "").trim(),
    };

    try {
      const res = await fetch("/api/legal/dmca-takedown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? `Submission failed (${res.status})`);
      }
      const json = (await res.json().catch(() => ({}))) as { reportId?: string | null };
      setState({ kind: "success", reportId: json.reportId ?? null });
      form.reset();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Submission failed",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <h2 className="text-lg font-semibold tracking-tight text-emerald-900 dark:text-emerald-200">
          Notice received
        </h2>
        <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-200/80">
          Thank you. We&rsquo;ve recorded your notice
          {state.reportId ? (
            <>
              {" "}
              with reference <code className="font-mono">{state.reportId}</code>
            </>
          ) : null}{" "}
          and forwarded it to legal@verkli.com. We respond to complete notices
          within 7 business days.
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="1. Your identity">
        <Field name="fullName" label="Full legal name" required maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="email" label="Email" type="email" required />
          <Field name="phone" label="Phone (optional)" />
        </div>
        <Textarea
          name="address"
          label="Mailing address"
          required
          rows={3}
          minLength={5}
          maxLength={500}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">I am submitting this notice as</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="representingCapacity"
              value="self"
              defaultChecked
              required
            />
            The rightsholder
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="representingCapacity" value="authorized_agent" />
            An authorised agent of the rightsholder
          </label>
        </fieldset>
      </Section>

      <Section title="2. The copyrighted work">
        <Field
          name="copyrightedWorkTitle"
          label="Title of the copyrighted work"
          required
          maxLength={500}
        />
        <Field
          name="copyrightedWorkUrl"
          label="URL to the original work (optional)"
          type="url"
        />
      </Section>

      <Section title="3. The allegedly infringing material">
        <Field
          name="infringingUrl"
          label="URL on Verkli where the infringing material appears"
          type="url"
          required
        />
        <Textarea
          name="infringingDescription"
          label="Describe what is infringing and why"
          required
          rows={4}
          minLength={10}
          maxLength={2000}
        />
      </Section>

      <Section title="4. Required statements">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="goodFaithStatement" required className="mt-1" />
          <span>
            I have a good faith belief that the use of the copyrighted material
            described above is not authorised by the copyright owner, its
            agent, or the law.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="accuracyStatement" required className="mt-1" />
          <span>
            The information in this notice is accurate, and under penalty of
            perjury, I am authorised to act on behalf of the copyright owner.
          </span>
        </label>
        <Field
          name="signature"
          label="Electronic signature (full name as you typed above)"
          required
        />
      </Section>

      {state.kind === "error" ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-800 dark:text-red-200">
          {state.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit DMCA notice"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4">
      <legend className="px-2 text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
};

function Field({ name, label, type = "text", required, maxLength }: FieldProps) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        maxLength={maxLength}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

type TextareaProps = {
  name: string;
  label: string;
  required?: boolean;
  rows?: number;
  minLength?: number;
  maxLength?: number;
};

function Textarea({ name, label, required, rows = 3, minLength, maxLength }: TextareaProps) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        name={name}
        required={required}
        rows={rows}
        minLength={minLength}
        maxLength={maxLength}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
