"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setActiveRoleCookieClient } from "@/lib/active-role";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";
import styles from "./Selector.module.css";

const VERKLI_ROLE_KEY = "verkli_role";

export default function RoleSelection() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;

    const role = localStorage.getItem(VERKLI_ROLE_KEY);
    if (role === "author") {
      router.replace("/author/home");
      return;
    }
    if (role === "reader") {
      router.replace("/reader/home");
      return;
    }

    const checkUserRole = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.role === "author") {
        localStorage.setItem(VERKLI_ROLE_KEY, "author");
        router.replace("/author/home");
        return;
      }
      if (profile?.role === "reader") {
        localStorage.setItem(VERKLI_ROLE_KEY, "reader");
        router.replace("/reader/home");
        return;
      }
    };

    checkUserRole().catch((err) => {
      console.warn("[role-selector] checkUserRole failed", err);
    });
  }, [router]);

  const setRoleAndGo = (role: "author" | "reader") => {
    if (typeof window !== "undefined") {
      setActiveRoleCookieClient(role);
      localStorage.setItem(VERKLI_ROLE_KEY, role);
      router.push(role === "author" ? "/author/home" : "/reader/home");
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}><Link href="/" aria-label="Verkli home"><Image src="/logo-dark.svg" alt="Verkli" width={140} height={32} className="h-8 w-auto dark:hidden" priority /><Image src="/favicon.svg" alt="Verkli" width={140} height={32} className="hidden h-8 w-auto dark:block" priority /></Link><Link href="/pricing">Pricing <ArrowUpRight size={15} /></Link></header>
      <div className={styles.content}>
        <div className={styles.intro}><h1>Every story<br />starts somewhere.</h1><p>Are you here to write or to read?<br />Make yourself at home. You can switch anytime.</p></div>
        <div className={styles.choices}>
          <button type="button" onClick={() => setRoleAndGo("author")}><PenLine size={25} strokeWidth={1.4} /><span><strong>I am an author</strong><span>Write, create and share your story.</span></span><ArrowUpRight size={22} /></button>
          <button type="button" onClick={() => setRoleAndGo("reader")}><BookOpen size={25} strokeWidth={1.4} /><span><strong>I am a reader</strong><span>Find your next book and the voices behind it.</span></span><ArrowUpRight size={22} /></button>
        </div>
        <Link href="/waitlist" className={styles.bookLink}>Just here for the book? {TA_FOR_ER_ORDER.bookTitle}<ArrowUpRight size={16} /></Link>
      </div>
      <footer className={styles.footer}><span>A home for authors and readers.</span><Link href="/support">Get in touch</Link></footer>
    </main>
  );
}
