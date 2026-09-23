import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BRAND_COLORS } from "@/lib/design/brand";
import styles from "@/components/public/PublicPage.module.css";

const STEPS = [
  {
    number: "01",
    color: BRAND_COLORS.violet,
    title: "Upload your chapter",
    description:
      "Import any chapter or manuscript — Word, PDF, or plain text. Verkli reads your writing and understands its tone, genre, and key moments.",
    icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    features: ["Word & PDF import", "Auto-detects tone & genre", "Supports all fiction and non-fiction"],
  },
  {
    number: "02",
    color: BRAND_COLORS.rose,
    title: "AI creates your content",
    description:
      "In seconds, Verkli generates platform-ready posts, short clips, hook quotes, and audiograms — all adapted to each platform's format and algorithm.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    features: ["TikTok & Reels scripts", "Quote cards & carousels", "Audiogram clips from key scenes"],
  },
  {
    number: "03",
    color: BRAND_COLORS.amber,
    title: "Publish everywhere",
    description:
      "Schedule and distribute your content to Amazon, Spotify, Apple Books, Instagram, and 10+ platforms — from one single dashboard. No copy-pasting, no reformatting.",
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    features: ["10+ platforms at once", "Smart scheduling", "One-click distribution"],
  },
  {
    number: "04",
    color: "#c894e6",
    title: "Grow your audience",
    description:
      "Track what content drives clicks, follows, and sales. Verkli shows you exactly which chapters resonate — so you can write more of what your readers love.",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    features: ["Per-chapter analytics", "Platform performance", "Audience growth tracking"],
  },
];

// ─── Feature highlights ───────────────────────────────────────────────────────
const HIGHLIGHTS = [
  {
    color: BRAND_COLORS.violet,
    title: "2-minute setup",
    description: "Connect your accounts, upload a chapter, and your first content is live before your coffee gets cold.",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    color: BRAND_COLORS.rose,
    title: "No marketing skills needed",
    description: "Verkli handles the copywriting, formatting, and timing. You just write — we do the rest.",
    icon: "M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z",
  },
  {
    color: BRAND_COLORS.amber,
    title: "Your voice, amplified",
    description: "Every piece of content is written in your style — not generic AI filler. Readers can't tell it apart from you.",
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
];

export default function HowItWorksPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <h1>Your manuscript.<br /><span>A world of possibility.</span></h1>
          <div><p>From the first chapter to your next reader. Follow the creative process, one step at a time.</p><div className={styles.actions}><Link href="/author/signup" className={styles.primary}>Start for free <ArrowUpRight size={16} /></Link><Link href="/author" className={styles.textLink}>Explore the studio</Link></div></div>
        </header>
        <section className={styles.chapters} aria-label="How Verkli works">
          {STEPS.map((step) => <article key={step.number} className={styles.chapter}><span className={styles.number}>{step.number}</span><h2>{step.title}</h2><div><p>{step.description}</p><div className={styles.tags}>{step.features.map((feature) => <span key={feature}>{feature}</span>)}</div></div></article>)}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><h2>Keep your focus<br />on the story.</h2><p>A connected workspace gives each part of your creative process a place.</p></div>
          {HIGHLIGHTS.map((item, index) => <article key={item.title} className={styles.chapter}><span className={styles.number}>0{index + 1}</span><h3>{item.title}</h3><div><p>{item.description}</p></div></article>)}
        </section>
        <section className={styles.invitation}><div><h2>See where your words can go.</h2><p>Start with your first book. Add more tools as your work grows.</p></div><div className={styles.actions}><Link href="/author/signup" className={styles.primary}>Start for free <ArrowUpRight size={16} /></Link><Link href="/pricing" className={styles.textLink}>View plans</Link></div></section>
      </div>
    </main>
  );
}
