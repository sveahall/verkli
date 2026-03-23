import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Verkli collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-16 md:py-24">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-white/40">
        Last updated: March 23, 2026
      </p>

      <div className="prose-policy mt-10 space-y-8 text-[15px] leading-[1.8] text-slate-700 dark:text-white/70">
        <section>
          <h2>1. Who we are</h2>
          <p>
            Verkli (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the
            platform at verkli.com. We connect authors with readers and provide
            tools for publishing, reading, and discovering books.
          </p>
        </section>

        <section>
          <h2>2. Data we collect</h2>
          <p>We collect the following categories of personal data:</p>
          <ul>
            <li>
              <strong>Account data</strong> &mdash; email address, display name,
              profile picture, and role (author or reader) when you create an
              account.
            </li>
            <li>
              <strong>Authentication data</strong> &mdash; credentials managed
              via our authentication provider (Supabase Auth) or third-party
              sign-in (Google).
            </li>
            <li>
              <strong>Usage data</strong> &mdash; pages visited, reading
              progress, bookmarks, highlights, reviews, and feature interactions.
            </li>
            <li>
              <strong>Payment data</strong> &mdash; billing information processed
              by Stripe. We do not store credit card numbers.
            </li>
            <li>
              <strong>Content</strong> &mdash; books, chapters, comments,
              messages, and other content you create on the platform.
            </li>
            <li>
              <strong>Device &amp; log data</strong> &mdash; IP address, browser
              type, operating system, and request timestamps collected
              automatically.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How we use your data</h2>
          <ul>
            <li>Provide, maintain, and improve the platform.</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Send transactional emails (e.g. password reset, receipts).</li>
            <li>Personalise your reading experience and recommendations.</li>
            <li>Monitor security and prevent abuse.</li>
            <li>Analyse usage to improve our product (via Vercel Analytics and Sentry error tracking).</li>
          </ul>
        </section>

        <section>
          <h2>4. Cookies</h2>
          <p>We use the following cookies:</p>
          <ul>
            <li>
              <strong>Essential cookies</strong> &mdash; authentication session,
              active role preference. These are required for the platform to
              function.
            </li>
            <li>
              <strong>Analytics cookies</strong> &mdash; Vercel Analytics and
              Google Analytics to understand how the platform is used. These are
              only set with your consent.
            </li>
          </ul>
          <p>
            You can manage your cookie preferences at any time using the cookie
            banner or your browser settings.
          </p>
        </section>

        <section>
          <h2>5. Data sharing</h2>
          <p>
            We share personal data only with trusted service providers that help
            us operate the platform:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> &mdash; database hosting and
              authentication.
            </li>
            <li>
              <strong>Stripe</strong> &mdash; payment processing.
            </li>
            <li>
              <strong>Resend</strong> &mdash; transactional email delivery.
            </li>
            <li>
              <strong>Vercel</strong> &mdash; hosting and analytics.
            </li>
            <li>
              <strong>Sentry</strong> &mdash; error monitoring.
            </li>
          </ul>
          <p>
            We do not sell your personal data to third parties.
          </p>
        </section>

        <section>
          <h2>6. Data retention</h2>
          <p>
            We retain your data for as long as your account is active. If you
            delete your account, we will remove your personal data within 30
            days, except where we are required by law to retain it.
          </p>
        </section>

        <section>
          <h2>7. Your rights</h2>
          <p>
            Under GDPR and applicable data protection laws, you have the right
            to:
          </p>
          <ul>
            <li>Access the personal data we hold about you.</li>
            <li>Rectify inaccurate data.</li>
            <li>Request deletion of your data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Export your data in a portable format.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:privacy@verkli.com">privacy@verkli.com</a>.
          </p>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            We use industry-standard security measures including encrypted
            connections (TLS), row-level security policies, rate limiting, and
            secure authentication to protect your data.
          </p>
        </section>

        <section>
          <h2>9. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will
            be communicated via email or a notice on the platform.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            Questions about this policy? Reach us at{" "}
            <a href="mailto:privacy@verkli.com">privacy@verkli.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
