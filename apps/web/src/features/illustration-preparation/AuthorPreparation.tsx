"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import PreparationPanel from "./PreparationPanel";
export function watchOwner(auth: SupabaseClient["auth"], ownerId: string, update: (owner: string | null) => void) {
  let active = true;
  const { data } = auth.onAuthStateChange((_event, session) => { if (active) update(session?.user.id === ownerId ? ownerId : null); });
  return () => { active = false; data.subscription.unsubscribe(); };
}
export default function AuthorPreparation({ ownerId }: { ownerId: string }) {
  const [verifiedOwner, setVerifiedOwner] = useState<string | null>(null);
  useEffect(() => watchOwner(createClient().auth, ownerId, setVerifiedOwner), [ownerId]);
  return verifiedOwner === ownerId ? <PreparationPanel key={ownerId} /> : <p role="status" className="p-6">Verifying your author session. If your account changed, reload this page.</p>;
}
