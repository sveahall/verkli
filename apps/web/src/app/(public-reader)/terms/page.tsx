import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules and conditions for using the Verkli platform.",
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-16 md:py-24">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-white/40">
        Last updated: September 4, 2026
      </p>

      <div className="prose-policy mt-10 space-y-8 text-[15px] leading-[1.8] text-slate-700 dark:text-white/70">
        <section>
          <h2>1. Acceptance</h2>
          <p>
            By creating an account or using Verkli (&quot;the platform&quot;),
            you agree to these Terms of Service. If you do not agree, do not use
            the platform.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <p>
            You must be at least 16 years old to use Verkli. By using the
            platform, you represent that you meet this requirement.
          </p>
        </section>

        <section>
          <h2>3. Accounts</h2>
          <ul>
            <li>You are responsible for keeping your credentials secure.</li>
            <li>
              You must provide accurate information when creating your account.
            </li>
            <li>
              One person may hold both an author and a reader role under the
              same account.
            </li>
            <li>
              We reserve the right to suspend or terminate accounts that violate
              these terms.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Author content</h2>
          <ul>
            <li>
              Authors retain full ownership and copyright of all content they
              publish on Verkli.
            </li>
            <li>
              By publishing, you grant Verkli a non-exclusive, worldwide licence
              to display, distribute, and promote your content on the platform.
            </li>
            <li>
              You may remove your content at any time, which will terminate this
              licence (subject to reasonable caching periods).
            </li>
            {/*
              Wording drafted by an engineer and shipped without a lawyer
              reading it. Recorded here so the next person treats it as
              provenance-unknown rather than assuming it was reviewed.

              It exists because the upload flow asks authors to confirm "a false
              statement here may end this project or close my account", and
              nothing in these terms previously granted Verkli the right to end
              a single project — §3 and §10 cover closing an ACCOUNT, not
              removing one book. The capability already existed (admin book
              deletion); this is the right to use it.

              These two must move together. A promise made in a checkbox that
              the terms do not support is worse than not asking at all, so if
              this clause is ever narrowed, narrow
              RIGHTS_WORDING.consequences in lib/imports/attestation.ts with it.
            */}
            <li>
              You confirm, when you upload a manuscript, that you hold the
              rights to it and that you wrote it. If that confirmation is
              untrue, we may remove the affected project, and may suspend or
              close your account.
            </li>
            <li>
              You must not publish content that infringes on the intellectual
              property rights of others, contains hate speech, or is illegal.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Reader conduct</h2>
          <ul>
            <li>
              Comments, reviews, and messages must be respectful and relevant.
            </li>
            <li>
              You may not harass, impersonate, or spam other users.
            </li>
            <li>
              You may not attempt to circumvent access controls or download
              protected content.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Payments and subscriptions</h2>
          <ul>
            <li>
              Payments are processed by Stripe. By making a purchase, you also
              agree to{" "}
              <a
                href="https://stripe.com/legal"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stripe&apos;s terms
              </a>
              .
            </li>
            <li>
              Subscription plans renew automatically. You can cancel at any time
              from your billing settings; access continues until the end of the
              current billing period.
            </li>
            <li>
              One-time purchases (e.g. individual audiobooks) are non-refundable
              unless the content is defective or unavailable.
            </li>
            <li>
              We reserve the right to change pricing with 30 days&apos; notice.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Prohibited use</h2>
          <p>You may not use Verkli to:</p>
          <ul>
            <li>Violate any applicable law or regulation.</li>
            <li>Upload malware or attempt to compromise our systems.</li>
            <li>Scrape, crawl, or harvest data beyond normal reading use.</li>
            <li>
              Use automated tools to create accounts, post content, or interact
              with the platform.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Intellectual property</h2>
          <p>
            The Verkli name, logo, design, and platform code are owned by
            Verkli. You may not copy, modify, or redistribute any part of the
            platform without permission.
          </p>
        </section>

        <section>
          <h2>9. Limitation of liability</h2>
          <p>
            Verkli is provided &quot;as is&quot; without warranties of any kind.
            To the maximum extent permitted by law, we are not liable for
            indirect, incidental, or consequential damages arising from your use
            of the platform.
          </p>
        </section>

        <section>
          <h2>10. Termination</h2>
          <p>
            You may delete your account at any time. We may terminate or suspend
            your access if you violate these terms. Upon termination, your right
            to use the platform ceases immediately, but provisions regarding
            intellectual property, limitation of liability, and governing law
            survive.
          </p>
        </section>

        <section>
          <h2>11. Governing law</h2>
          <p>
            These terms are governed by the laws of Sweden. Any disputes shall
            be resolved by the courts of Sweden.
          </p>
        </section>

        <section>
          <h2>12. Changes</h2>
          <p>
            We may update these terms from time to time. Continued use of the
            platform after changes constitutes acceptance. Material changes will
            be communicated via email or a notice on the platform.
          </p>
        </section>

        <section>
          <h2>13. Contact</h2>
          <p>
            Questions? Contact us at{" "}
            <a href="mailto:hello@verkli.com">hello@verkli.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
