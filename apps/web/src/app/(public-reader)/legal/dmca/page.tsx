import type { Metadata } from "next";
import DmcaForm from "./DmcaForm";

export const metadata: Metadata = {
  title: "DMCA Takedown Notice | Verkli",
  description:
    "Submit a DMCA takedown notice for content you believe infringes your copyright on Verkli.",
};

export default function DmcaPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold tracking-tight">DMCA Takedown Notice</h1>
        <p className="text-base text-muted-foreground">
          If you believe content on Verkli infringes your copyright, you may
          submit a notice under the U.S. Digital Millennium Copyright Act (17
          U.S.C. § 512). All fields are required for a complete notice; an
          incomplete notice may delay our response.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
          Before you submit
        </h2>
        <ul className="list-inside list-disc space-y-2">
          <li>
            We respond to valid DMCA notices by removing or disabling access
            to the identified material and notifying the user who posted it.
          </li>
          <li>
            <strong className="text-foreground">Misrepresenting</strong> that
            material is infringing may carry legal liability under § 512(f).
            You will be asked to confirm under penalty of perjury that the
            information you provide is accurate.
          </li>
          <li>
            If you are not the rightsholder, you must be authorised to act on
            their behalf.
          </li>
          <li>
            For non-DMCA reports (harassment, hate speech, spam) use the
            in-product Report button on the offending content instead.
          </li>
        </ul>
      </section>

      <DmcaForm />

      <footer className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
        <p>
          Counter-notice: if you believe your content was wrongly removed,
          email{" "}
          <a className="underline" href="mailto:legal@verkli.com">
            legal@verkli.com
          </a>{" "}
          with the subject line <em>“DMCA Counter-Notice”</em> and the
          information required by 17 U.S.C. § 512(g)(3).
        </p>
      </footer>
    </main>
  );
}
