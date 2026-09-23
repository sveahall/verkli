"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { connectionsClient, connectionStatus, type ConnectionsClient, type SafeConnection } from "@/lib/social/connections-client";

export function ChannelConnections({ client = connectionsClient, testMode = false }: { client?: ConnectionsClient; testMode?: boolean }) {
  const [connections, setConnections] = useState<SafeConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(true);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    client.list()
      .then(result => { if (!cancelled) setConnections(result); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load connections. Reload to check access and status."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [client]);
  const act = async (action: "load" | "connect" | "disconnect") => {
    if (busy) return; setBusy(true); setError(null); setNotice(null);
    try {
      if (action === "connect") await client.connectX();
      if (action === "disconnect") { await client.disconnectX(); setConfirmDisconnect(false); setNotice(testMode ? "Synthetic connection removed. No external account changed." : "Disconnected from Verkli. Check X app permissions to confirm platform revocation. Started posts cannot be recalled."); }
      setConnections(await client.list());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update connections. Reload to check status."); }
    finally { setBusy(false); }
  };
  const x = connections?.find(c => c.platform === "x");
  const connected = x && x.status !== "revoked";
  return <section aria-label="Channel connections" className="space-y-5">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Channel connections</h1>
      {testMode ? <p className="text-sm font-medium">Synthetic test connection · no OAuth or external account changes</p> : null}
      <p className="text-sm text-muted-foreground">Review which account your channel uses. Connecting an account does not approve or publish campaign posts.</p>
      <p className="text-sm text-muted-foreground">Social account management uses the existing Pro access requirement. Instagram and TikTok still require manual sharing.</p>
    </header>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
    <Button variant="ghost" disabled={busy} onClick={() => act("load")}>Reload connection status</Button>
    {!connections && !error ? <p role="status">Loading connections…</p> : null}
    {connections && !error ? <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-medium">X</h2>
      <p className="text-sm">{connectionStatus(x)}{x?.platform_username ? ` · @${x.platform_username}` : ""}</p>
      <p className="text-sm text-muted-foreground">Campaign delivery has separate approval and availability checks. A connected account is not a delivery receipt.</p>
      {connected ? <>
        <p className="text-sm text-muted-foreground">For an expired or incorrect account, disconnect it here and then connect the intended account.</p>
        {confirmDisconnect ? <div className="space-y-2" role="group" aria-label="Confirm disconnect">
          <p className="text-sm">Disconnect this X account from Verkli? This removes the saved credentials; existing posts remain on X.</p>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => act("disconnect")}>Confirm disconnect</Button><Button disabled={busy} variant="ghost" onClick={() => setConfirmDisconnect(false)}>Keep connection</Button></div>
        </div> : <Button disabled={busy} variant="secondary" onClick={() => setConfirmDisconnect(true)}>Disconnect X</Button>}
      </> : <Button disabled={busy} onClick={() => act("connect")}>{testMode ? "Simulate connecting X" : "Connect X"}</Button>}
    </div> : null}
    <div className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-medium">Instagram and TikTok</h2><p className="mt-2 text-sm text-muted-foreground">Automatic publishing is unavailable. Prepare your campaign copy and share it manually in the platform.</p></div>
  </section>;
}
