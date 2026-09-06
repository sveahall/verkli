"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Languages, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import AuthorProductPreview from "./AuthorProductPreview";
import styles from "./AuthorLandingPage.module.css";

const AuthorDashboard = dynamic(() => import("@/features/author/AuthorDashboard"), { ssr: false });

const WORKFLOW = [
  { number: "01", title: "Write", description: "Find your flow. Draft, organize chapters, and refine your manuscript with AI by your side.", detail: "From a spark to a story", icon: PenLine },
  { number: "02", title: "Translate", description: "Bring your book into another language. Review your translation and make every sentence feel right.", detail: "New languages. Your voice.", icon: Languages },
  { number: "03", title: "Create audio", description: "Give your words a voice. Explore AI narration and shape your chapters into an audiobook.", detail: "A different way to be heard", icon: AudioLines },
  { number: "04", title: "Publish", description: "Bring your book to Verkli. Build your author presence and give readers a place to discover your work.", detail: "Ready for its next chapter", icon: BookOpen },
];

function LandingPage() {
  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="author-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.dot} /> VERKLI FOR AUTHORS</p>
          <h1 id="author-heading" className={styles.headline}>Your story.<br />Supercharged.</h1>
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
        <div className={styles.storyScene} role="img" aria-label="Illustration of The shape of light, an example story, as a manuscript, a Spanish edition, and an audiobook">
          <div className={styles.sceneStage} aria-hidden="true">
            <div className={styles.sceneFloor} />
            <div className={`${styles.sceneBook} ${styles.sceneCoral}`}><span>THE ORIGINAL</span><strong>The shape<br />of light.</strong><div className={styles.coverPortal} /><small>A story by you</small></div>
            <div className={`${styles.sceneBook} ${styles.sceneViolet}`} lang="es"><span>OTRA PERSPECTIVA</span><strong>La forma<br />de la luz.</strong><div className={styles.coverPortal} /><small>Una nueva edición</small></div>
            <div className={`${styles.sceneBook} ${styles.sceneBlue}`}><span>A WORLD OF POSSIBILITIES</span><strong>The shape<br />of light.</strong><div className={styles.coverPortal} /><small>VERKLI / A NOVEL</small></div>
            <div className={styles.sceneGlass}><AudioLines size={24} /><span>From words.<br /><strong>To worlds.</strong></span></div>
          </div>
          <div className={styles.sceneCaption} aria-hidden="true"><span>ONE STORY. EVERY DIMENSION.</span><span>Illustrative editions</span></div>
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
                {step.number === "01" && <div className={styles.artManuscript}><span>Chapter one.</span><i /><i /><i /><i /><b /></div>}
                {step.number === "02" && <div className={styles.artLanguages}><span>A</span><ArrowRight size={26} /><span lang="ja">あ</span></div>}
                {step.number === "03" && <div className={styles.artWave}>{[18, 32, 52, 36, 72, 100, 64, 42, 84, 57, 30, 44, 18].map((height, index) => <i key={index} style={{ height }} />)}</div>}
                {step.number === "04" && <div className={styles.artPublished}><i /><i /><div><span>YOUR<br />NEXT<br />CHAPTER.</span><BookOpen size={22} /></div></div>}
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
          <div className={styles.editions} aria-label="Illustration of the same example story in different editions">
            <p className={styles.editionsLabel}>One imagination. Many editions.</p>
            <div className={`${styles.editionBook} ${styles.editionBack}`} lang="es"><span>Una novela</span><strong>La forma<br />de la luz.</strong><div className={styles.editionOrbit} /><small>Edición de ejemplo</small></div>
            <div className={`${styles.editionBook} ${styles.editionFront}`}><span>A novel</span><strong>The shape<br />of light.</strong><div className={styles.editionOrbit} /><small>An example story</small></div>
            <span className={styles.editionCaption}>A story doesn’t have to stay<br />where it started.</span>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="start-heading">
        <div className={styles.finalHeading}>
          <span className={styles.finalMark} aria-hidden="true">v.</span>
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
