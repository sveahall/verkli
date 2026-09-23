import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";
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
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}><h1>A little help.<br /><span>From real people.</span></h1><p>Send us a message and it reaches the team that builds Verkli. We aim to answer within two business days.</p></header>
        <section className={`${styles.section} ${styles.split}`} aria-labelledby="support-form-heading">
          <div><h2 id="support-form-heading">How can we help?</h2><p>Tell us what happened and include any useful details. If you would rather write an email directly, you will find our addresses below.</p></div>
          <SupportContactForm isSignedIn={isSignedIn} />
        </section>
        <section className={styles.section} aria-labelledby="support-email-heading">
          <div className={styles.sectionHeading}><h2 id="support-email-heading">The right place<br />for your question.</h2><p>You can also reach us directly by email.</p></div>
          {CONTACT_ROUTES.map((route,index) => <article key={route.email} className={styles.chapter}><span className={styles.number}>0{index + 1}</span><h3>{route.label}</h3><div><p>{route.description}</p><a href={`mailto:${route.email}`} className={styles.textLink}>{route.email}</a></div></article>)}
        </section>
        <section className={`${styles.section} ${styles.split}`} aria-labelledby="support-faq-heading"><h2 id="support-faq-heading">Common questions.</h2><div className={`${styles.questions} prose-policy`}>{FAQ.map((entry) => <details key={entry.question}><summary>{entry.question}<Plus size={18} aria-hidden="true" /></summary><p>{entry.answer}</p></details>)}</div></section>
        <nav className={`${styles.actions} pb-16`} aria-label="Legal information"><Link href="/privacy" className={styles.textLink}>Privacy Policy</Link><Link href="/terms" className={styles.textLink}>Terms of Service</Link><Link href="/legal/dmca" className={styles.textLink}>Copyright complaints</Link></nav>
      </div>
    </main>
  );
}
