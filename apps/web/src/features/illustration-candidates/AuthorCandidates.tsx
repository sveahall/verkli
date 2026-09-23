"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCandidateAdapter } from "./api-adapter";
import type { CandidateScopeKey } from "./contracts";
import CandidatePanel from "./CandidatePanel";

export default function AuthorCandidates({ ownerId, scope }: { ownerId: string; scope: CandidateScopeKey }) {
  const [verified, setVerified] = useState(false);
  const adapter = useMemo(() => createCandidateAdapter(ownerId, scope), [ownerId, scope]);
  useEffect(() => {
    const client = createClient(); let active = true;
    // Do not render private proposals across an account change, even before navigation finishes.
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (active) setVerified(session?.user.id === ownerId); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [ownerId]);
  return verified ? <CandidatePanel key={adapter.contextId} adapter={adapter} /> : <p role="status" className="p-6">Verifying your author session. If your account changed, reload this page.</p>;
}
