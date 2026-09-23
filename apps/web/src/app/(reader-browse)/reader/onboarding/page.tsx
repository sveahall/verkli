import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRecommendationsEnabled } from "@/lib/flags";
import OnboardingFlow from "./OnboardingFlow";

export default async function ReaderOnboardingPage() {
  if (!getRecommendationsEnabled()) {
    redirect("/reader/home");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/home");
  }

  // Check if onboarding already completed
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect("/reader/home");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <OnboardingFlow />
    </div>
  );
}
