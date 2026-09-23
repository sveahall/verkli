"use client";
import { useCallback, useRef, useState } from "react";
import BetaInvitationsPanel from "@/app/admin/beta/BetaInvitationsPanel";
const recipients = [
  { id: "author", source: "author_waitlist", email: "alex.author@example.com", invitedAt: null },
  { id: "reader", source: "reader_waitlist", email: "sam.reader@example.com", invitedAt: null },
];
export default function Preview() {
  const [fail, setFail] = useState(false);
  const accepted = useRef(new Set<string>());
  const request = useCallback(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { id } = JSON.parse(String(init.body));
      const already = accepted.current.has(id);
      if (!fail) accepted.current.add(id);
      return Response.json({ accessEnabled: true, delivery: { status: fail ? "retry" : already ? "already_sent" : "sent", message: fail ? "Access is enabled. Email acceptance is unconfirmed; retry safely within 23 hours." : already ? "This welcome was already accepted. No duplicate was sent." : "Access is enabled and the welcome email was accepted by the mail provider." } });
    }
    if (url.startsWith("/api/admin/users")) return Response.json({ users: [{ user_id: "existing", email: "existing@example.com", beta_enabled: true }] });
    return Response.json({ recipients, allowance: { limit: 20, remaining: 20 - accepted.current.size }, hasMore: false });
  }, [fail]);
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-2xl font-display">Beta invitation preview</h1><p className="my-3 text-sm">Local fixtures only. No emails are sent and no accounts are changed.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} />Simulate a delivery failure</label><BetaInvitationsPanel request={request} /></main>;
}
