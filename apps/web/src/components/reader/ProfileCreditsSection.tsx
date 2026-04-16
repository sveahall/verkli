"use client";

import { useEffect, useRef } from "react";
import { CreditsBalance } from "@/components/credits/CreditsBalance";
import { ReferralCodeGenerator } from "@/components/referrals/ReferralCodeGenerator";
import { ReferralRedeemForm } from "@/components/referrals/ReferralRedeemForm";
import { useToastHelpers } from "@/components/ui/toast";

type Props = {
  /** "success" | "cancel" from ?credits= query param after Stripe redirect */
  creditCheckout?: string | null;
};

export default function ProfileCreditsSection({ creditCheckout }: Props) {
  const toast = useToastHelpers();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    if (creditCheckout === "success") {
      shownRef.current = true;
      toast.success("Payment completed — credits will be added shortly.");
    } else if (creditCheckout === "cancel") {
      shownRef.current = true;
      toast.error("Payment was cancelled.");
    }
  }, [creditCheckout, toast]);

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
      <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">
        Credits &amp; Referrals
      </h2>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60">
        View your balance and invite friends to earn extra credits.
      </p>

      <div className="mt-5">
        <CreditsBalance
          pollIntervalMs={creditCheckout === "success" ? 5000 : 0}
          className="text-base"
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ReferralCodeGenerator />
        <ReferralRedeemForm />
      </div>
    </section>
  );
}
