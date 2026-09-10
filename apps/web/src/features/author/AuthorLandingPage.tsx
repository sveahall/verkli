"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import AuthorLandingSections from "./AuthorLandingSections";
import { AuthorStoryProvider, AuthorStudioExperience } from "./AuthorStoryExperience";
import styles from "./AuthorLandingSections.module.css";

const AuthorDashboard = dynamic(() => import("@/features/author/AuthorDashboard"), { ssr: false });

function LandingPage() {
  return <AuthorStoryProvider>
    <main className={`${styles.page} author-light -mt-[88px]`}>
      <section className={styles.hero} aria-labelledby="author-hero-title">
        <div className={styles.heroIntro}>
          <div><h1 id="author-hero-title">One story.<br /><span>Every possibility.</span></h1></div>
          <div className={styles.heroCopy}><p>Write the book only you can write.<br />Then take it further.</p><p>Writing, translation, audiobooks and publishing.<br className={styles.desktopBreak} /> Connected in one creative workspace.</p><div className={styles.heroActions}><Link href="/waitlist" className={styles.primaryButton}>Get early access <ArrowUpRight size={17} /></Link><a href="#studio" className={styles.textLink}>Explore the studio <ArrowDown size={15} /></a></div></div>
        </div>
        <AuthorStudioExperience />
      </section>
      <AuthorLandingSections />
    </main>
  </AuthorStoryProvider>;
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
