"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import UserMenu from "@/components/navbar/UserMenu";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

export default function ReaderLanding() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (event === "SIGNED_IN" && session?.user) setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050508]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#907AFF]" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#050508] text-white">
      {/* Hero Section */}
      <section className="relative mx-auto flex min-h-[80vh] w-full max-w-[1200px] flex-col items-center justify-center px-6 text-center">
        {/* Animated background glows - brand colors */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div 
            className="absolute left-1/4 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-[150px]" 
            style={{ background: "#907AFF", opacity: 0.2, animationDuration: "4s" }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] translate-x-1/2 animate-pulse rounded-full blur-[120px]" 
            style={{ background: "#E29ED5", opacity: 0.15, animationDuration: "5s", animationDelay: "1s" }}
          />
          <div 
            className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-[100px]" 
            style={{ background: "#FCC997", opacity: 0.1, animationDuration: "3s", animationDelay: "0.5s" }}
          />
        </div>

        <h1 className="relative z-10 text-[48px] font-medium leading-[1.1] tracking-[-0.02em] text-white md:text-[64px]">
          Discover stories
          <br />
          <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">that move you.</span>
        </h1>
        <p className="relative z-10 mt-6 max-w-[480px] text-[16px] leading-relaxed text-white/50">
          Connect with your favorite authors, explore new worlds, and be part of the stories you love.
        </p>

        <div className="relative z-10 mt-10 flex gap-4">
          <Link href="/reader/signup">
            <GlassSurface
              {...glassBaseProps}
              width="auto"
              height="auto"
              borderRadius={999}
              className="glass-button border border-white/20 transition-transform hover:scale-[1.02]"
            >
              <span className="px-8 py-3 text-[15px] font-medium text-white">Start reading</span>
            </GlassSurface>
          </Link>
          <Link
            href="#explore"
            className="flex items-center gap-2 rounded-full border border-white/10 px-8 py-3.5 text-[15px] font-medium text-white/60 transition-all hover:border-white/20 hover:text-white/80"
          >
            Explore books
          </Link>
        </div>
      </section>

      {/* Featured Section Placeholder */}
      <section id="explore" className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[32px] font-medium tracking-[-0.02em] text-white">Featured Books</h2>
            <p className="mt-2 text-[15px] text-white/40">Curated stories for you</p>
          </div>
          <button className="text-[14px] font-medium text-white/50 transition hover:text-white/70">
            View all
          </button>
        </div>
        
        <div className="mt-10 grid gap-5 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="group aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]"
            />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-[1200px] border-t border-white/[0.06] px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Verkli" className="h-5 w-5" />
            <span className="text-[14px] font-medium text-white/60">verkli</span>
          </div>
          <div className="flex gap-8 text-[13px] text-white/40">
            <Link href="/" className="transition hover:text-white/60">Home</Link>
            <Link href="/reader/signin" className="transition hover:text-white/60">Sign in</Link>
            <Link href="/writer" className="transition hover:text-white/60">For writers</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
