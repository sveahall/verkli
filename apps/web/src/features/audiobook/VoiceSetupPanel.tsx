"use client";
import { useEffect, useRef, useState } from "react";
import { parseVoiceRequest, type VoiceRequest, type VoiceSetupAdapter } from "@/lib/audiobook/voice-request-contract";

type Props = { ownerId: string; adapter: VoiceSetupAdapter };
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const statusCopy: Record<VoiceRequest["status"], string> = {
  pending: "Pending — the synthetic request is saved.",
  requesting: "Requesting — the simulated worker is processing the original request.",
  ready: "Ready — the synthetic voice binding is verified.",
  failed: "Failed — no synthetic voice is available.",
  uncertain: "Uncertain — reconcile the original request before continuing.",
  deleting: "Deleting — cleanup is pending for the same synthetic voice.",
  deleted: "Deleted — synthetic cleanup is complete.",
};
export default function VoiceSetupPanel(props: Props) {
  return <ScopedVoiceSetupPanel key={props.ownerId} {...props} />;
}
function ScopedVoiceSetupPanel({ ownerId, adapter }: Props) {
  const [sample, setSample] = useState("synthetic-valid");
  const [consent, setConsent] = useState(false);
  const [row, setRow] = useState<VoiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0), response = useRef(0), locked = useRef(false);
  const requestKey = useRef<string | null>(null);
  const reload = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const current = ++generation.current;
    locked.current = false;
    async function load() {
      const id = ++response.current;
      try {
        const value = await adapter.load(ownerId);
        if (current !== generation.current || id !== response.current) return;
        const parsed = value === null ? null : parseVoiceRequest(value, ownerId);
        if (parsed) requestKey.current = parsed.requestKey;
        setRow(parsed); setLoadFailed(false); setLoading(false); setError(null);
      } catch (cause) {
        if (current !== generation.current || id !== response.current) return;
        setRow(null); setLoadFailed(true); setLoading(false);
        setError(cause instanceof Error ? cause.message : "The saved demo operation could not be loaded.");
      }
    }
    reload.current = load;
    const unsubscribe = adapter.subscribe(() => { void load(); });
    void load();
    return () => { generation.current = current + 1; unsubscribe(); };
  }, [adapter, ownerId]);
  async function act(action: "start" | "revoke" | "reconcile" | "cleanup") {
    if (locked.current || loading || loadFailed) return;
    if (action === "start" && (row || !consent || sample !== "synthetic-valid")) return;
    if (action !== "start" && !row) return;
    locked.current = true; setBusy(true); setError(null);
    const current = generation.current;
    try {
      requestKey.current ??= crypto.randomUUID();
      const value = action === "start"
        ? await adapter.start({ ownerId, requestKey: requestKey.current, sampleId: sample, consent })
        : await adapter[action](ownerId, row!.id);
      if (current !== generation.current) return;
      parseVoiceRequest(value, ownerId);
      await reload.current();
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "The synthetic operation could not be completed.");
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }
  return <section aria-label="Voice setup" className="space-y-7">
    <header className="border-b border-border pb-6"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Audio / Voice studio</p><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">A voice, with your say.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Explore setup, consent and cleanup with a simulated voice. This demo uses a synthetic sample catalog and creates no real voice.</p></header>
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_0.85fr]">
      <div className="space-y-5">
        <fieldset disabled={loading || loadFailed || busy || !!row} className="space-y-5"><legend className="mb-4 text-lg font-semibold">Prepare your demo voice</legend>
          <label className="block text-sm font-medium">Synthetic sample<select aria-describedby="sample-help" value={sample} onChange={(event) => setSample(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="synthetic-valid">Valid synthetic sample</option><option value="missing">Missing sample</option><option value="synthetic-invalid">Invalid synthetic sample</option></select></label>
          <p id="sample-help" className="text-sm text-muted-foreground">{sample === "missing" ? "A sample is required. Choose the valid synthetic sample." : sample === "synthetic-invalid" ? "This fixture sample is invalid. Choose the valid synthetic sample." : "The catalog sample is valid for this simulation. No recording is uploaded."}</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" className="mt-1 accent-primary" checked={row ? !row.consentRevoked : consent} onChange={(event) => setConsent(event.target.checked)} aria-describedby="consent-help" /><span className="text-sm leading-6">I consent to this synthetic demo operation.</span></label>
          <p id="consent-help" className="text-xs leading-5 text-muted-foreground">{row ? row.consentRevoked ? "Recorded demo consent has been revoked. Cleanup follows the original request." : "Explicit demo consent was recorded for this saved operation. You can revoke it below." : consent ? "Demo consent selected. You can revoke it while the request is pending or after it is ready." : "Select demo consent to continue. This is not consent to clone a person's voice or acceptance of real service terms."}</p>
        </fieldset>
        {!row && <button className={`${button} bg-primary text-primary-foreground`} disabled={loading || loadFailed || busy || !consent || sample !== "synthetic-valid"} onClick={() => void act("start")}>Create synthetic voice</button>}
        <div role="status" aria-live="polite" className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><p>{loading ? "Loading the saved demo operation…" : loadFailed ? "The saved operation could not be verified. Setup is locked." : row ? statusCopy[row.status] : "No voice operation yet. Choose a sample and give explicit demo consent to start."}</p>{row?.consentRevoked && <p className="mt-2">Demo consent revoked.</p>}</div>
        {(error || row?.error) && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error || row?.error}</p>}
        <div className="flex flex-wrap gap-3">
          {loadFailed && <button className={button} onClick={() => void reload.current()}>Retry loading operation</button>}
          {row && !row.consentRevoked && row.status !== "deleted" && <button className={button} disabled={busy} onClick={() => void act("revoke")}>Revoke demo consent</button>}
          {row?.status === "uncertain" && <button className={button} disabled={busy} onClick={() => void act("reconcile")}>Reconcile original request</button>}
          {row?.status === "deleting" && <button className={button} disabled={busy} onClick={() => void act("cleanup")}>Retry cleanup</button>}
        </div>
        {row && <dl className="space-y-2 break-words text-xs text-muted-foreground"><div><dt className="font-medium">Operation</dt><dd>{row.id}</dd></div><div><dt className="font-medium">Demo author</dt><dd>{row.ownerId}</dd></div>{row.binding && <div><dt className="font-medium">Verified synthetic voice</dt><dd>{row.binding.voiceId}</dd></div>}</dl>}
      </div>
      <aside className="space-y-5 rounded-2xl border border-border bg-muted/30 p-6"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Local simulation</p><h2 className="mt-2 font-display text-2xl font-semibold">Keep control of the request.</h2></div><ol className="space-y-4 text-sm leading-6"><li><span className="font-medium">1. Choose and consent.</span> A valid synthetic sample and an explicit choice start one operation.</li><li><span className="font-medium">2. Resolve the outcome.</span> If a response is lost, reconcile the same request. No second voice is created.</li><li><span className="font-medium">3. Revoke and clean up.</span> A late success after revocation must be cleaned up before the operation is complete.</li></ol><p className="text-xs leading-5 text-muted-foreground">Saved in this tab&apos;s browser session. Reloading keeps the synthetic ledger; closing the tab clears it. Demo authors are scenario controls, not authentication. No real identity, consent evidence or provider provenance is established.</p><p className="text-xs leading-5 text-muted-foreground">Requirements for real sample length, format and retention are not yet approved or decided.</p></aside>
    </div>
  </section>;
}
