import type { Metadata } from "next";
import Link from "next/link";
import SupportContactForm from "./SupportContactForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with your Verkli account, your purchases, and your reading. Send us a message or read answers to the questions we get most.",
};

type ContactRoute = {
  label: string;
  email: string;
  description: string;
};

const CONTACT_ROUTES: ContactRoute[] = [
  {
    label: "General help",
    email: "hello@verkli.com",
    description:
      "Accounts, sign-in trouble, purchases, a book that will not open — start here.",
  },
  {
    label: "Privacy and your data",
    email: "privacy@verkli.com",
    description:
      "Access, correct, export, or delete the personal data we hold about you.",
  },
  {
    label: "Copyright and legal",
    email: "legal@verkli.com",
    description: "Copyright complaints, takedown notices, and legal enquiries.",
  },
];

type FaqEntry = {
  question: string;
  answer: React.ReactNode;
};

const FAQ: FaqEntry[] = [
  {
    question: "I bought a book. Where is it?",
    answer: (
      <>
        It appears in{" "}
        <Link href="/reader/library">your library</Link> as soon as the payment
        is confirmed. Card payments confirm in seconds; some methods take a few
        minutes. If the payment went through and the book is still missing after
        that, send us the title and the date and we will put it right.
      </>
    ),
  },
  {
    question: "How do I read a book I own?",
    answer: (
      <>
        Open it from your library and pick a chapter. Your place is saved as you
        read, so you can carry on from the same spot next time you sign in.
      </>
    ),
  },
  {
    question: "Can I get a refund?",
    answer: (
      <>
        One-time purchases are non-refundable unless the content is defective or
        unavailable — see the <Link href="/terms">Terms of Service</Link>. A book
        that will not open, or a chapter that is missing, counts as defective:
        write to us and we will sort it out.
      </>
    ),
  },
  {
    question: "I cannot sign in.",
    answer: (
      <>
        Use the forgot-password link on the{" "}
        <Link href="/reader/signin">sign-in page</Link> to reset your password.
        If the reset email does not arrive, check your spam folder, then contact
        us and we will help from our side.
      </>
    ),
  },
  {
    question: "How do I delete my account or get a copy of my data?",
    answer: (
      <>
        Write to <a href="mailto:privacy@verkli.com">privacy@verkli.com</a> and
        we will handle it. Our <Link href="/privacy">Privacy Policy</Link> sets
        out which rights you have and how long each request takes.
      </>
    ),
  },
  {
    question: "I write on Verkli. Where do I get help?",
    answer: (
      <>
        Author accounts have their own feedback form inside the author dashboard,
        under Account. For anything urgent, or if you cannot reach the dashboard,
        this form and{" "}
        <a href="mailto:hello@verkli.com">hello@verkli.com</a> both reach us.
      </>
    ),
  },
  {
    question: "Someone published my work without permission.",
    answer: (
      <>
        File a takedown notice on our{" "}
        <Link href="/legal/dmca">copyright complaints page</Link>. It goes
        straight to <a href="mailto:legal@verkli.com">legal@verkli.com</a>, and
        we respond to complete notices within seven business days.
      </>
    ),
  },
];

export default async function SupportPage() {
  // Resolved here, not in the client component: the form has to know whether a
  // reply address is optional. Signed in, we can answer via the account; signed
  // out with no address, a submission has no reply channel at all — while the
  // success screen still promised an answer within two business days.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSignedIn = Boolean(user);

  return (
    <main className="page-content-narrow py-16 md:py-24">
      <p className="text-eyebrow">Support</p>
      <h1 className="text-page-title mt-3">How can we help?</h1>
      <p className="text-body mt-4 max-w-[60ch]">
        Send us a message with the form below and it reaches the team that builds
        Verkli — there is no queue of scripted replies in between. We aim to
        answer within two business days. If you would rather write an email
        directly, the addresses are further down.
      </p>

      <section className="mt-10" aria-labelledby="support-form-heading">
        <h2 id="support-form-heading" className="text-section-title mb-4">
          Send us a message
        </h2>
        <SupportContactForm isSignedIn={isSignedIn} />
      </section>

      <section className="mt-14" aria-labelledby="support-email-heading">
        <h2 id="support-email-heading" className="text-section-title">
          Email us directly
        </h2>
        <ul className="mt-4 space-y-3">
          {CONTACT_ROUTES.map((route) => (
            <li key={route.email} className="card-base-subtle p-5">
              <p className="text-label">{route.label}</p>
              <a
                href={`mailto:${route.email}`}
                className="mt-1 inline-block rounded-md text-[15px] font-medium text-[#907AFF] underline underline-offset-2 transition-colors hover:text-[#7A66E0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
              >
                {route.email}
              </a>
              <p className="text-helper mt-1.5">{route.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="support-faq-heading">
        <h2 id="support-faq-heading" className="text-section-title">
          Common questions
        </h2>
        <div className="prose-policy mt-6 space-y-7 text-[15px] leading-[1.8] text-slate-700 dark:text-white/70">
          {FAQ.map((entry) => (
            <div key={entry.question}>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                {entry.question}
              </h3>
              <p className="mt-1.5">{entry.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="prose-policy text-helper mt-14">
        Also useful: <Link href="/privacy">Privacy Policy</Link> ·{" "}
        <Link href="/terms">Terms of Service</Link> ·{" "}
        <Link href="/legal/dmca">Copyright complaints</Link>
      </p>
    </main>
  );
}
