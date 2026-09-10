"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BRAND_COLORS } from "@/lib/design/brand";
import styles from "@/components/public/PublicPage.module.css";

const valueBenefits = [
  {
    title: "Discover stories you actually care about",
    description:
      "Find work that resonates. No endless scrolling—curated paths to stories that matter to you.",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    color: BRAND_COLORS.violet,
  },
  {
    title: "Follow authors directly",
    description:
      "Stay close to the people who write. Get new chapters and updates without algorithms in the way.",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998-0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    color: BRAND_COLORS.rose,
  },
  {
    title: "Read across genres in one place",
    description:
      "Fiction, essays, serials—all in a single home. Switch moods, not apps.",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
    color: BRAND_COLORS.amber,
  },
  {
    title: "Support authors you love",
    description:
      "Your attention and support go straight to creators. Read knowing you're part of their journey.",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    color: BRAND_COLORS.amberSoft,
  },
];

const howItWorksSteps = [
  {
    step: 1,
    title: "Discover stories",
    description:
      "Browse by mood, genre, or author. Find something that pulls you in.",
    color: BRAND_COLORS.violet,
  },
  {
    step: 2,
    title: "Follow authors or series",
    description: "Stay updated on what you care about. No feed noise.",
    color: BRAND_COLORS.rose,
  },
  {
    step: 3,
    title: "Read and engage",
    description:
      "Dive in. Comment, save, and return whenever you're ready.",
    color: BRAND_COLORS.amber,
  },
];

const whyDifferent = [
  {
    title: "Direct connection to authors",
    text: "Stories and updates come from the people who write them, not from an algorithm.",
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    color: BRAND_COLORS.violet,
  },
  {
    title: "Less noise, more quality",
    text: "A place built for reading, not for infinite scroll or engagement tricks.",
    icon: "M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z",
    color: BRAND_COLORS.rose,
  },
  {
    title: "Built for long-form storytelling",
    text: "Serials, novels, and essays get the space they need—no squeezing into feeds.",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    color: BRAND_COLORS.amber,
  },
  {
    title: "Reader-first platform",
    text: "Every decision starts with how it feels to read and discover, not to advertise.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z",
    color: BRAND_COLORS.amberSoft,
  },
];

type ReaderView = "home" | "app" | "how-it-works" | "membership";

const pageIntro: Record<ReaderView, { title: string; accent: string; description: string }> = {
  home: { title: "One more chapter.", accent: "A whole new world.", description: "Discover independent voices. Follow the people behind the pages. Find a story that stays with you." },
  app: { title: "All your stories.", accent: "One place to return.", description: "Discover books, save your reading, and stay close to the authors you follow. A home for your reading life." },
  "how-it-works": { title: "Follow your curiosity.", accent: "Find your next story.", description: "Start with a book, a genre or an author. Explore without signing up, then join to follow authors and save your reading." },
  membership: { title: "Make room for stories.", accent: "Make yourself at home.", description: "Join Verkli to follow authors, save your reading and return to the stories you care about." },
};

export default function ReaderLanding({ view = "home" }: { view?: ReaderView }) {
  const router = useRouter();
  const intro = pageIntro[view];
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        return;
      }
      const role =
        user.user_metadata?.active_role ?? user.user_metadata?.role;
      if (role === "reader") {
        router.replace("/reader/home");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.role === "reader") {
        router.replace("/reader/home");
        return;
      }
      setAuthChecked(true);
    };
    check().catch((error) => {
      console.warn("[reader-landing] Could not check session", error);
      setAuthChecked(true);
    });
  }, [router]);

  if (!authChecked) return <div role="status" className="flex min-h-[60vh] items-center justify-center gap-3 bg-background text-sm text-muted-foreground"><span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" />Opening Verkli…</div>;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <h1>{intro.title}<br /><span>{intro.accent}</span></h1>
          <div><p>{intro.description}</p><div className={styles.actions}><Link href={view === "membership" ? "/reader/signup" : "/reader/discover"} className={styles.primary}>{view === "membership" ? "Join Verkli" : "Explore stories"} <ArrowUpRight size={16} /></Link><Link href={view === "membership" ? "/reader/signin" : "/reader/signup"} className={styles.textLink}>{view === "membership" ? "Already a member? Sign in" : "Join Verkli"}</Link></div></div>
        </header>
        {view === "how-it-works" ? <section className={styles.chapters} aria-label="Three steps to your next story">{howItWorksSteps.map((step) => <article key={step.step} className={styles.chapter}><span className={styles.number}>0{step.step}</span><h2>{step.title}</h2><div><p>{step.description}</p></div></article>)}</section> : <section className={styles.readerStage} aria-labelledby="reader-discover-heading">
          <div><h2 id="reader-discover-heading">Follow your curiosity.</h2><p>A familiar genre. An unfamiliar voice. There is more than one way into your next story.</p></div>
          <nav className={styles.readerPaths} aria-label="Ways to discover"><Link href="/reader/discover">Explore the books <ArrowUpRight size={20} /></Link><Link href="/reader/genres">Find your genre <ArrowUpRight size={20} /></Link><Link href="/reader/authors">Meet the authors <ArrowUpRight size={20} /></Link></nav>
        </section>}
        <section className={styles.section}>
          <div className={styles.sectionHeading}><h2>A little closer<br />to what you love.</h2><p>Built for readers who want more than a feed.</p></div>
          {valueBenefits.map((item,index) => <article key={item.title} className={styles.chapter}><span className={styles.number}>0{index + 1}</span><h3>{item.title}</h3><div><p>{item.description}</p></div></article>)}
        </section>
        {view === "home" && <section className={`${styles.section} ${styles.split}`}>
          <div><h2>Make yourself<br />at home.</h2><p>Three steps to your next favourite story.</p><div className={styles.actions}><Link href="/reader/how-it-works" className={styles.textLink}>See how it works <ArrowUpRight size={16} /></Link></div></div>
          <div className={styles.questions}>{howItWorksSteps.map((step) => <details key={step.step} open={step.step === 1}><summary>{step.title}<Plus size={18} aria-hidden="true" /></summary><p>{step.description}</p></details>)}</div>
        </section>}
        {view === "home" && <section className={`${styles.section} ${styles.split}`}>
          <h2>Stories deserve<br />some space.</h2>
          <div className={styles.questions}>{whyDifferent.map((item) => <details key={item.title}><summary>{item.title}<Plus size={18} aria-hidden="true" /></summary><p>{item.text}</p></details>)}</div>
        </section>}
        <section className={styles.invitation}><div><h2>Your next story is waiting.</h2><p>Explore without signing up, or join Verkli to follow authors and save your reading.</p></div><div className={styles.actions}><Link href="/reader/signup" className={styles.primary}>Join Verkli <ArrowUpRight size={16} /></Link><Link href="/author" className={styles.textLink}>Here to write?</Link></div></section>
      </div>
    </main>
  );
}
