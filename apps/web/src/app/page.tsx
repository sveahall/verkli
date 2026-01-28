"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import LiquidEther from "@/components/LiquidEther";
import { createClient } from "@/lib/supabase/client";

const VERKLI_ROLE_KEY = "verkli_role";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0,
  blur: 8,
  saturation: 1,
  mixBlendMode: "difference",
};

const glassCardProps = {
  ...glassBaseProps,
};

const glassButtonProps = {
  ...glassBaseProps,
};

export default function RoleSelection() {
  const router = useRouter();

  // Om rollen redan är vald (i localStorage), redirecta direkt – visa aldrig väljaren igen
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const role = localStorage.getItem(VERKLI_ROLE_KEY);
    if (role === "writer") {
      router.replace("/writer");
      return;
    }
    if (role === "reader") {
      router.replace("/reader");
      return;
    }
    
    // Om inloggad men ingen roll vald, kolla om de har roll i profil
    const checkUserRole = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (profile?.role === "writer") {
        localStorage.setItem(VERKLI_ROLE_KEY, "writer");
        router.replace("/writer");
        return;
      }
      if (profile?.role === "reader") {
        localStorage.setItem(VERKLI_ROLE_KEY, "reader");
        router.replace("/reader");
        return;
      }
    };
    
    checkUserRole();
  }, [router]);

  const setRoleAndGo = (role: "writer" | "reader") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VERKLI_ROLE_KEY, role);
      // Redirect direkt efter val
      router.push(role === "writer" ? "/writer" : "/reader");
    }
  };

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden text-slate-900 dark:text-white"
      style={{ background: "var(--auth-background)" }}
    >
      {/* Animated background */}
      <div className="absolute inset-0 z-0">
        <LiquidEther
          colors={["#907AFF", "#E29ED5", "#FCC997", "#FEE9A3"]}
          color0="#907AFF"
          color1="#E29ED5"
          color2="#FCC997"
          mouseForce={12}
          cursorSize={85}
          isViscous={false}
          viscous={8}
          iterationsViscous={4}
          iterationsPoisson={12}
          resolution={0.2}
          isBounce
          autoDemo={false}
          autoSpeed={0.5}
          autoIntensity={2}
          takeoverDuration={0.5}
          autoResumeDelay={3000}
          autoRampDuration={0.25}
          className="liquid-ether-layer"
        />
      </div>

      {/* Role selection card */}
      <GlassSurface
        {...glassCardProps}
        width="520px"
        height="auto"
        borderRadius={40}
        className="glass-card relative z-10"
      >
        <div className="flex w-full flex-col items-center px-14 py-16 text-center">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/75">
            Welcome to verkli
          </p>
          
          <h1 className="mt-5 text-[44px] font-medium leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Are you a writer
            <br />
            or reader?
          </h1>
          
          <p className="mt-5 max-w-[340px] text-base leading-relaxed text-slate-600 dark:text-white/75">
            Verkli adapts to how you use it.
            <br />
            You can switch anytime.
          </p>

          <div className="mt-12 flex w-full flex-col items-center gap-4">
            <button onClick={() => setRoleAndGo("writer")} className="w-full">
              <GlassSurface
                {...glassButtonProps}
                width="100%"
                height="auto"
                borderRadius={999}
                className="glass-button w-full"
              >
                <span className="block w-full px-7 py-1.5 text-[17px] font-medium text-slate-900 dark:text-white">
                  I am a writer
                </span>
              </GlassSurface>
            </button>
            
            <span className="text-sm font-medium text-slate-500 dark:text-white/35">or</span>
            
            <button onClick={() => setRoleAndGo("reader")} className="w-full">
              <GlassSurface
                {...glassButtonProps}
                width="100%"
                height="auto"
                borderRadius={999}
                backgroundOpacity={0.22}
                className="glass-button w-full"
              >
                <span className="block w-full px-7 py-1.5 text-[17px] font-medium text-slate-900 dark:text-white">
                  I am a reader
                </span>
              </GlassSurface>
            </button>
          </div>
        </div>
      </GlassSurface>
    </main>
  );
}
