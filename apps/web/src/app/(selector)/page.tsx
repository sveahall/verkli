"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassCard, { glassCardProps } from "@/components/GlassCard";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

const VERKLI_ROLE_KEY = "verkli_role";


export default function RoleSelection() {
  const router = useRouter();
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const mainRef = useRef<HTMLElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setMousePos({ x, y });
  };

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

    checkUserRole();
  }, [router]);

  const setRoleAndGo = (role: "author" | "reader") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VERKLI_ROLE_KEY, role);
      router.push(role === "author" ? "/author" : "/reader");
    }
  };

  return (
    <main
      ref={mainRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-screen min-h-dvh min-h-svh flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300 px-4 py-6"
    >
      {/* Exakt samma bakgrund som author sign in – absolute (samma stacking som kortet så Safari backdrop-filter fungerar) */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/10 via-[#E29ED5]/8 to-[#FCC997]/10 dark:from-slate-900/95 dark:via-purple-950/90 dark:to-slate-900/95" />
        <div
          className="absolute h-[700px] w-[700px] rounded-full blur-[100px] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(144, 122, 255, 0.4) 0%, rgba(226, 158, 213, 0.3) 30%, rgba(252, 201, 151, 0.25) 50%, transparent 70%)",
            left: `${mousePos.x * 100}%`,
            top: `${mousePos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            willChange: "left, top",
          }}
        />
      </div>

      {/* Logo + Back */}
      <header className="absolute left-6 top-6 z-30 flex items-center gap-3 sm:left-8 sm:top-8">
        <Link href="/" className="flex min-h-[44px] min-w-[44px] items-center" aria-label="verkli">
          <img src="/logo-dark.svg" alt="verkli" className="h-8 w-auto dark:hidden" loading="eager" />
          <img src="/favicon.svg" alt="verkli" className="hidden h-8 w-auto dark:block" loading="eager" />
        </Link>
      </header>

      {/* Theme toggle – samma plats som sign in */}
      <div className="absolute bottom-8 right-8 z-30">
        <ThemeToggle glassProps={glassCardProps} />
      </div>

      {/* Samma kort som signin/signup – solid i light, glass i dark */}
      <GlassCard className="card-auth">
        <div className="flex w-full flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12 md:px-12 md:py-14">
          <p className="text-sm font-medium tracking-wide text-slate-600 dark:text-white/50 sm:text-base">
            Welcome to verkli
          </p>

          <h1 className="mt-3 text-2xl font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white sm:mt-4 sm:text-3xl md:text-[36px]">
            Are you an author
            <br />
            or reader?
          </h1>

          <p className="mt-3 max-w-[340px] text-base leading-relaxed text-slate-600 dark:text-white/75 sm:mt-4">
            verkli adapts to how you use it.
            <br />
            You can switch anytime.
          </p>

          <div className="mt-8 flex w-full flex-col items-center gap-4 sm:mt-10">
            <button
              type="button"
              onClick={() => setRoleAndGo("author")}
              className="btn-primary w-full"
            >
              I am an author
            </button>

            <div className="flex w-full items-center gap-4">
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              <span className="text-sm text-slate-500 dark:text-white/30">or</span>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <button
              type="button"
              onClick={() => setRoleAndGo("reader")}
              className="btn-secondary w-full"
            >
              I am a reader
            </button>
          </div>
        </div>
      </GlassCard>
    </main>
  );
}
