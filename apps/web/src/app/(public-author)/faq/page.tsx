import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";

const CATEGORIES = [
  {
    label: "Getting started",
    items: [
      {
        q: "What is Verkli?",
        a: "Verkli is an author OS — a platform where you write, publish, and grow your readership. It gives you a rich writing editor, AI tools for translation and audiobook generation, marketing automation, and a reader-facing app, all in one place.",
      },
      {
        q: "Is Verkli free to use?",
        a: "Yes. The Free plan lets you write and publish up to three books with no credit card required. Upgrade to Pro when you want AI translation, audiobook generation, and the full feature set.",
      },
      {
        q: "Do I need to be a published author to sign up?",
        a: "Not at all. Verkli is built for writers at every stage — from first drafts to established publishing careers.",
      },
    ],
  },
  {
    label: "Writing & publishing",
    items: [
      {
        q: "What does the editor support?",
        a: "The editor supports rich text with headings, paragraphs, lists, block quotes, and code blocks. It auto-saves as you type and handles multiple chapters per book.",
      },
      {
        q: "Can I have multiple versions of a book?",
        a: "Yes. With Verkli Pro you can have multiple book versions — for example, an original English edition and translated editions in French, Spanish, German, and more.",
      },
      {
        q: "How do I publish a book?",
        a: "Set a title, cover, and genre, then mark your book as published. Readers can discover your work through the Verkli reader app immediately.",
      },
    ],
  },
  {
    label: "AI features",
    items: [
      {
        q: "How does AI translation work?",
        a: "Select a book version and choose a target language. Verkli translates every chapter using a production-grade AI pipeline. The result is a fully separate book version — ready to read, edit, and publish.",
      },
      {
        q: "Which languages does translation support?",
        a: "Verkli supports 20+ languages including Swedish, English, French, Spanish, German, Italian, Portuguese, Dutch, Polish, Japanese, and more.",
      },
      {
        q: "What is audiobook generation?",
        a: "Pick a voice and Verkli generates a full audio version of your book, chapter by chapter. You can listen to the preview in the editor, download files, or publish it alongside your text edition.",
      },
      {
        q: "What are AI marketing campaigns?",
        a: "Verkli can generate social media copy, email newsletters, and promotional content for your book — tailored to your genre and audience — from inside the editor.",
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        q: "What is included in the Pro plan?",
        a: "Pro includes unlimited books, AI translation, audiobook generation, AI marketing campaigns, book trailers, advanced analytics, multiple book versions, and priority support.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from your billing settings at any time. You keep Pro access until the end of the current billing period.",
      },
      {
        q: "Is there an annual discount?",
        a: "Yes — annual billing saves you roughly 35% compared to monthly. You can switch between billing periods in your account settings.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <h1>A few answers.<br /><span>A clear way forward.</span></h1>
          <div><p>Everything you need to know about writing, publishing and growing with Verkli.</p><div className={styles.actions}><Link href="/support" className={styles.textLink}>Talk to our team <ArrowUpRight size={16} /></Link></div></div>
        </header>
        {CATEGORIES.map((category) => (
          <section key={category.label} className={`${styles.section} ${styles.split}`}>
            <h2>{category.label}</h2>
            <div className={styles.questions}>
              {category.items.map((item) => <details key={item.q}><summary>{item.q}<Plus size={18} aria-hidden="true" /></summary><p>{item.a}</p></details>)}
            </div>
          </section>
        ))}
        <section className={styles.invitation}><div><h2>Ready for your next chapter?</h2><p>Start writing, or take a closer look at the plans.</p></div><div className={styles.actions}><Link href="/author/signup" className={styles.primary}>Create account <ArrowUpRight size={16} /></Link><Link href="/pricing" className={styles.textLink}>View pricing</Link></div></section>
      </div>
    </main>
  );
}
