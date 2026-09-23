"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Minus, Plus } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";

const FEATURE_GROUPS = [
  {
    label: "Writing & publishing",
    rows: [
      { label: "Books", free: "Up to 3", pro: "Unlimited" },
      { label: "Rich text editor", free: true, pro: true },
      { label: "Formatting & publishing tools", free: true, pro: true },
    ],
  },
  {
    label: "AI features",
    rows: [
      { label: "AI translation (20+ languages)", free: false, pro: true },
      { label: "Audiobook generation", free: false, pro: true },
      { label: "AI marketing campaigns", free: false, pro: true },
      { label: "Book trailer (AI video)", free: false, pro: true },
      { label: "Multiple book versions", free: false, pro: true },
    ],
  },
  {
    label: "Analytics & support",
    rows: [
      { label: "Basic analytics", free: true, pro: true },
      { label: "Advanced analytics & country map", free: false, pro: true },
      { label: "Community support", free: true, pro: true },
      { label: "Priority support", free: false, pro: true },
    ],
  },
];

type Faq = { q: string; a: string; annualOnly?: boolean };

const FAQS: Faq[] = [
  {
    q: "Can I start for free?",
    a: "Yes. The Free plan lets you write and publish up to three books with no credit card required. Upgrade anytime to unlock AI features.",
  },
  {
    q: "What does AI translation include?",
    a: "Verkli Pro translates your entire book — every chapter — into 20+ languages using a production-grade translation pipeline. You get a fully separate book version for each language, ready to publish.",
  },
  {
    q: "How does audiobook generation work?",
    a: "Select any book version and choose a voice. Verkli generates a full audiobook audio file per chapter, which you can listen to, download, or publish alongside your text edition.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. You can cancel your Pro subscription at any time from your billing settings. You'll keep Pro access until the end of the billing period.",
  },
  {
    q: "Is there a yearly discount?",
    a: "Yes — annual billing saves you 35% compared to month-to-month. Toggle between monthly and annual on the pricing cards above.",
    // Points at a toggle that only renders when an annual price exists, so the
    // answer has to disappear with it.
    annualOnly: true,
  },
  {
    q: "Do you offer team or enterprise plans?",
    a: "We're working on it. If you represent a publishing house or large team, reach out to us and we'll find something that works.",
  },
];

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span>{value}</span>;
  return value ? <><Check size={17} aria-hidden="true" /><span className="sr-only">Included</span></> : <><Minus size={17} aria-hidden="true" /><span className="sr-only">Not included</span></>;
}

export default function PricingPageContent({ annualAvailable }: { annualAvailable: boolean }) {
  const [annualSelected, setAnnualSelected] = useState(false);
  const annual = annualAvailable && annualSelected;
  const proMonthly = 29;
  const proAnnualPerMonth = 19;
  const displayPrice = annual ? proAnnualPerMonth : proMonthly;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <h1>Room to begin.<br /><span>Space to grow.</span></h1>
          <div>
            <p>Start free. Upgrade when you need AI translation, audiobooks, and the full author workspace.</p>
            {annualAvailable && <div className={styles.billingToggle} aria-label="Billing period"><button type="button" aria-pressed={!annual} onClick={() => setAnnualSelected(false)}>Monthly</button><button type="button" aria-pressed={annual} onClick={() => setAnnualSelected(true)}>Annual</button><span>Save 35% annually</span></div>}
          </div>
        </header>
        <section className={styles.planGrid} aria-label="Author plans">
          <article className={styles.plan}>
            <h2 className={styles.planLabel}>Free</h2>
            <div className={styles.price}><strong>$0</strong><span>/month</span></div>
            <p>Everything you need to start writing and publishing.</p>
            <ul>{["Up to 3 books", "Rich text editor", "Publishing tools", "Basic analytics", "Community support"].map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
            <Link href="/author/signup" className={styles.secondary}>Start for free <ArrowUpRight size={16} /></Link>
          </article>
          <article className={`${styles.plan} ${styles.planPro}`}>
            <h2 className={styles.planLabel}>Pro</h2>
            <div className={styles.price}><strong>${displayPrice}</strong><span>/month</span></div>
            {annual && <p>Billed ${proAnnualPerMonth * 12}/year</p>}
            <p>Full AI suite — translation, audio, video, marketing.</p>
            <ul>{["Everything in Free", "Unlimited books", "AI translation (20+ languages)", "Audiobook generation", "AI marketing campaigns", "Book trailer (AI video)", "Advanced analytics & map", "Priority support"].map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
            <Link href="/author/signup" className={styles.primary}>Get Pro <ArrowUpRight size={16} /></Link>
          </article>
        </section>
        <p className="pb-12 pt-6 text-center text-xs leading-relaxed text-muted-foreground">No credit card required to start · Cancel anytime · Instant access</p>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><h2>Everything,<br />side by side.</h2><p>Find the right fit for the way you write, publish and reach your readers.</p></div>
          <table className={styles.comparison}>
            <caption className="sr-only">Compare Free and Pro author plans</caption>
            <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead>
            <tbody>{FEATURE_GROUPS.map((group) => <Fragment key={group.label}><tr className={styles.groupRow}><th colSpan={3} scope="rowgroup">{group.label}</th></tr>{group.rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td><FeatureCell value={row.free} /></td><td><FeatureCell value={row.pro} /></td></tr>)}</Fragment>)}</tbody>
          </table>
        </section>
        <section className={`${styles.section} ${styles.split}`}>
          <div><h2>A little more clarity.</h2><p>Questions about your plan, your work or what comes next.</p></div>
          <div className={styles.questions}>{FAQS.filter((item) => annualAvailable || !item.annualOnly).map((item) => <details key={item.q}><summary>{item.q}<Plus size={18} aria-hidden="true" /></summary><p>{item.a}</p></details>)}</div>
        </section>
        <section className={styles.invitation}><div><h2>Your first book is free. Always.</h2><p>Sign up in seconds. No credit card required. Add Pro when you are ready to scale.</p></div><div className={styles.actions}><Link href="/author/signup" className={styles.primary}>Start for free <ArrowUpRight size={16} /></Link><Link href="/how-it-works" className={styles.textLink}>See how it works</Link></div></section>
      </div>
    </main>
  );
}
