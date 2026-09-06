"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, AudioLines, FileText, Languages, PenLine, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import AuthorProductPreview from "./AuthorProductPreview";
import styles from "./AuthorLandingPage.module.css";

const AuthorDashboard = dynamic(() => import("@/features/author/AuthorDashboard"), { ssr: false });

const WORKFLOW = [
  { number: "01", title: "Write", description: "Find your flow. Draft, organize chapters, and refine your manuscript with AI by your side.", detail: "From a spark to a story", icon: PenLine },
  { number: "02", title: "Translate", description: "Bring your book into another language. Review your translation and make every sentence feel right.", detail: "New languages. Your voice.", icon: Languages },
  { number: "03", title: "Create audio", description: "Give your words a voice. Explore AI narration and shape your chapters into an audiobook.", detail: "A different way to be heard", icon: AudioLines },
  { number: "04", title: "Publish", description: "Bring your book to Verkli. Build your author presence and give readers a place to discover your work.", detail: "Ready for its next chapter", icon: FileText },
];

function LandingPage() {
  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="author-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.dot} /> YOUR AI CREATIVE STUDIO</p>
          <h1 id="author-heading" className={styles.headline}>Your story.<br /><span className={styles.brandAccent}>Supercharged.</span></h1>
          <p className={styles.heroDescription}>
            Your imagination. An entire AI workspace.<br className={styles.desktopBreak} />{" "}
            Write, translate, create audiobooks, and publish with Verkli.
          </p>
          <div className={styles.heroActions}>
            <Link href="/author/signup" className={styles.primaryLink}>Start writing for free <ArrowUpRight aria-hidden="true" size={18} /></Link>
            <a href="#workspace" className={styles.secondaryLink}>Explore the workspace <ArrowRight aria-hidden="true" size={17} /></a>
          </div>
          <p className={styles.heroFootnote}>Your ideas. Your voice. A whole new dimension.</p>
        </div>
      </section>

      <section id="workspace" className={styles.previewSection} aria-label="Explore the Verkli workspace">
        <div className={styles.previewCaption}><span><span className={styles.dot} /> MEET YOUR NEW WORKSPACE</span><span>Click a tab. See the possibilities.</span></div>
        <AuthorProductPreview />
        <p className={styles.previewNote}>An example manuscript, a glimpse of what’s possible. Your story starts with a blank page.</p>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-heading">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>The whole journey, connected</p>
          <h2 id="workflow-heading">Big ambition.<br /><span>One workspace.</span></h2>
          <p>Stay with your story, from the first sentence<br className={styles.desktopBreak} /> to the moment it meets a reader.</p>
        </div>
        <ol className={styles.workflowSteps}>
          {WORKFLOW.map((step) => (
            <li key={step.number}>
              <div className={styles.stepArt} data-step={step.number} aria-hidden="true">
                {step.number === "01" && <div className={styles.artManuscript}><span className={styles.artLabel}><PenLine size={12} /> MANUSCRIPT</span><strong>It starts with<br />an idea<span className={styles.artCursor} />.</strong><div className={styles.artSuggestion}><Sparkles size={12} /><span>A little creative possibility</span></div></div>}
                {step.number === "02" && <div className={styles.artLanguages}><div><span>ENGLISH</span><strong>The morning<br />the lighthouse<br />went dark.</strong></div><ArrowRight size={18} /><div lang="es"><span>ESPAÑOL</span><strong>La mañana<br />en que el faro<br />se apagó.</strong></div></div>}
                {step.number === "03" && <div className={styles.artAudio}><span className={styles.artLabel}><AudioLines size={12} /> NARRATION</span><div className={styles.artWave}>{[18, 32, 52, 36, 72, 100, 64, 42, 84, 57, 30, 44, 18].map((height, index) => <i key={index} style={{ height }} />)}</div><span className={styles.artAudioLabel}>Your words. A new dimension.</span></div>}
                {step.number === "04" && <div className={styles.artPublished}><div className={styles.artDocumentHeader}><FileText size={14} /><span>YOUR STORY / VERKLI</span></div><strong>The shape<br />of light</strong><div className={styles.artDocumentLine} /><div className={styles.artDocumentLine} /><span className={styles.artDocumentFooter}>A place to be discovered <ArrowUpRight size={13} /></span></div>}
              </div>
              <span className={styles.stepNumber}>{step.number}<span aria-hidden="true">↗</span></span>
              <h3><step.icon size={19} aria-hidden="true" />{step.title}</h3>
              <p>{step.description}</p>
              <span className={styles.stepDetail}>{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.voiceSection} aria-labelledby="voice-heading">
        <div className={styles.voiceInner}>
          <div className={styles.voiceCopy}>
            <p className={styles.eyebrow}>Made for the author in you</p>
            <h2 id="voice-heading">More possibilities.<br /><span>Still your story.</span></h2>
            <p className={styles.voiceLead}>The best part of a book is the person behind it. Verkli gives you tools to take it further, with room for your judgment, your ideas, and your voice.</p>
            <dl className={styles.voiceDetails}>
              <div><dt>A creative partner</dt><dd>Use AI to explore ideas and refine a passage. You decide what belongs on the page.</dd></div>
              <div><dt>A wider canvas</dt><dd>Try another language or a spoken chapter. Let your story take a new form.</dd></div>
              <div><dt>A place to be discovered</dt><dd>Bring your books and your author profile together on Verkli for readers to explore.</dd></div>
            </dl>
          </div>
          <div className={styles.storyTransform}>
            <div className={styles.transformHeader}><Sparkles size={17} aria-hidden="true" /><span>ONE STORY. NEW POSSIBILITIES.</span><span>Example</span></div>
            <div className={styles.transformPassage}><span>01 / ENGLISH</span><p>The morning the lighthouse went dark.</p></div>
            <div className={styles.transformPassage} lang="es"><span>02 / ESPAÑOL</span><p>La mañana en que el faro se apagó.</p></div>
            <div className={styles.transformAudio}><span>03 / A NEW VOICE</span><div className={styles.transformWave} aria-hidden="true">{[15, 27, 18, 46, 34, 62, 84, 58, 32, 48, 70, 94, 60, 40, 54, 79, 50, 29, 44, 22, 35, 15].map((height, index) => <i key={index} style={{ height }} />)}</div><p>A story doesn’t have to stay where it started.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="start-heading">
        <div className={styles.finalHeading}>
          <Image className={styles.finalMark} src="/favi.svg" alt="" width={64} height={58} />
          <p className={styles.eyebrow}>For the stories only you can tell</p>
          <h2 id="start-heading">The next chapter<br /><span>is yours.</span></h2>
          <p>Make room for the book you’ve been meaning to write.</p>
          <Link href="/author/signup" className={styles.primaryLink}>Start writing for free <ArrowUpRight aria-hidden="true" size={18} /></Link>
          <div className={styles.finalLinks}><Link href="/how-it-works">How it works <ArrowUpRight aria-hidden="true" size={15} /></Link><Link href="/pricing">View pricing <ArrowUpRight aria-hidden="true" size={15} /></Link></div>
        </div>
        <div className={styles.finalColophon}><span>VERKLI / FOR AUTHORS</span><span>A world of stories starts with one.</span></div>
      </section>
    </main>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function AuthorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => { const { data: { user } } = await supabase.auth.getUser(); setUser(user); setLoading(false); };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT") setUser(null); else if (event === "SIGNED_IN" && session?.user) setUser(session.user); });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#050508]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-[#907AFF] dark:border-white/20"></div></div>;

  return user ? <AuthorDashboard /> : <LandingPage />;
}
