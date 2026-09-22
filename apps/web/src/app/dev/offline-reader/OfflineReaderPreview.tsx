"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createIndexedDbOfflineStorage, OwnedOfflineStore, type OfflineDownload, type OfflineOwner } from "@/lib/offline/owned-store";
import { OFFLINE_FIXTURE_AUDIENCE } from "@/lib/offline/lease";

const endpoint = "/api/dev/offline-reader-fixture";
const channelName = "verkli-offline-owned-fixture-v1";
const sameOwner = (a: OfflineOwner | null, b: OfflineOwner) => a?.userId === b.userId && a?.generation === b.generation;

export default function OfflineReaderPreview() {
  const store = useRef<OwnedOfflineStore | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const current = useRef<OfflineOwner | null>(null);
  const revision = useRef(0);
  const opened = useRef(false);
  const access = useRef(false);
  const selectedThisMount = useRef(false);
  const failCleanup = useRef(false);
  const pauseCheck = useRef(false);
  const resumeCheck = useRef<(() => void) | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Opening isolated fixture storage…");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);

  const hideText = useCallback(() => {
    revision.current++;
    opened.current = false;
    setText(null);
    setExpiry(null);
    setPending(false);
    setMessage("Saved text is closed. Open it again to verify access.");
  }, []);
  const lockAccess = useCallback(() => {
    hideText();
    access.current = false;
    setUnlocked(false);
  }, [hideText]);
  function unlockAccess() {
    access.current = true;
    setUnlocked(true);
  }
  function announceInvalidation(ticket: OfflineOwner) {
    // Notify other tabs even if the separate durable denial write fails.
    try { store.current?.invalidate(ticket); }
    finally { channel.current?.postMessage({ type: "invalidate", owner: ticket }); }
  }
  async function denyAndClear(ticket: OfflineOwner) {
    const active = sameOwner(current.current, ticket);
    if (active) { lockAccess(); current.current = null; setOwner(null); }
    const run = revision.current;
    try {
      announceInvalidation(ticket);
      await store.current?.revoke(ticket);
      if (active && run === revision.current) setError("Fixture access revoked. Saved text has been cleared.");
    } catch (cause) {
      if (active && run === revision.current) setError(`Access blocked. Saved text could not be cleared: ${cause instanceof Error ? cause.message : "Storage unavailable."}`);
    }
  }

  useEffect(() => {
    const generation = revision;
    let disposed = false;
    const events = new BroadcastChannel(channelName);
    channel.current = events;
    async function refresh() {
      if (!store.current || !access.current) return;
      const run = revision.current;
      try {
        const context = await store.current.context();
        if (disposed || run !== revision.current) return;
        if (!sameOwner(current.current, context)) {
          lockAccess();
          current.current = null;
          setOwner(null);
          setMessage("Account changed. Reconnect and verify the current fixture account.");
        } else if (opened.current && context.userId) {
          const chapters = await store.current.read(context, "fixture-book", "fixture-en-v1");
          if (!disposed && run === revision.current && access.current) setText(chapters?.map((chapter) => chapter.text).join("\n\n") ?? null);
        }
      } catch (cause) {
        if (!disposed && run === revision.current) {
          lockAccess();
          setError(cause instanceof Error ? cause.message : "Could not read offline storage.");
        }
      }
    }
    events.onmessage = (event) => {
      const ticket = event.data?.owner as OfflineOwner | undefined;
      if (event.data?.type !== "invalidate" || !ticket || !sameOwner(current.current, ticket)) return;
      lockAccess();
      current.current = null;
      setOwner(null);
      setMessage("Offline access blocked by another tab. Reconnect and select the account again.");
      try { store.current?.invalidate(ticket); }
      catch { setError("Access blocked. Storage is unavailable; saved text may remain on this device."); }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hideText();
      else void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void refresh(), 500);
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error("The fixture server is unavailable. Reconnect and reload.");
        const fixture = await response.json();
        const key = await crypto.subtle.importKey("jwk", fixture.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
        if (disposed) return;
        const storage = createIndexedDbOfflineStorage(channelName);
        store.current = new OwnedOfflineStore({ ...storage, atomic: (update) => storage.atomic((state) => {
          const result = update(state);
          if (failCleanup.current && state.userId === null) throw new Error("Simulated cleanup transaction failure");
          return result;
        }) }, key, () => Date.now(), OFFLINE_FIXTURE_AUDIENCE);
        setReady(true);
        // Remount never unlocks persisted text automatically, including when a
        // prior denial/cleanup could not persist. Explicit online check required.
        const context = await store.current.context();
        if (disposed) return;
        current.current = context;
        setOwner(context.userId);
        setMessage(context.userId ? "Saved account found. Select a fixture account online to clear old text and start a new session." : "No account. Select a synthetic fixture account.");
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Could not open fixture.");
      }
    })();
    return () => {
      disposed = true;
      generation.current++;
      access.current = false;
      selectedThisMount.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      events.close();
      channel.current = null;
      store.current = null;
    };
  }, [hideText, lockAccess]);

  async function selectOwner(userId: string | null) {
    if (!store.current) return;
    const previous = current.current;
    lockAccess();
    current.current = null;
    setOwner(null);
    const run = revision.current;
    setError(null);
    try {
      if (previous?.userId) announceInvalidation(previous);
      if (userId) {
        if (offline) throw new Error("Reconnect before changing fixture accounts.");
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: userId, action: "restore" }) });
        if (!response.ok) throw new Error("Could not verify fixture account.");
        if (run !== revision.current) return;
      }
      const context = await store.current.activateOwner(userId);
      if (run !== revision.current) return;
      current.current = context;
      selectedThisMount.current = true;
      setOwner(userId);
      if (userId) unlockAccess();
      setMessage(userId ? "Synthetic account selected. Nothing has been saved for it yet." : "Logged out. Saved fixture text cleared in all tabs.");
    } catch (cause) {
      if (run === revision.current) setError(`Access blocked. Saved text may remain on this device. ${cause instanceof Error ? cause.message : "Could not switch account."}`);
    }
  }

  async function save(shortLease = false, delayed = false) {
    if (!store.current || !current.current?.userId || !access.current) return;
    const client = store.current;
    const ticket = current.current;
    const run = revision.current;
    setPending(true);
    setError(null);
    setMessage(delayed ? "Downloading fixture; save will wait 3 seconds. Try logging out now." : "Downloading and verifying every chapter…");
    try {
      if (offline) throw new Error("Reconnect to save or renew offline text.");
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: ticket.userId, action: "download", shortLease }) });
      if (response.status === 403 || response.status === 401) { await denyAndClear(ticket); return; }
      if (!response.ok) throw new Error("Download failed. Nothing was marked as saved.");
      const download: OfflineDownload = await response.json();
      if (delayed) await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      await client.save(ticket, download);
      if (run !== revision.current || !access.current) return;
      setExpiry(new Date(JSON.parse(download.lease.payload).expiresAt).toLocaleString());
      setMessage("Complete synthetic text saved. Open it below, including in fixture offline mode.");
    } catch (cause) {
      if (run === revision.current) {
        setMessage("The new download was not saved. Retry while connected.");
        setError(cause instanceof Error ? cause.message : "Could not save offline text.");
      }
    } finally { if (run === revision.current) setPending(false); }
  }

  async function openSaved() {
    if (!store.current || !current.current?.userId || !access.current) return;
    const run = revision.current;
    setError(null);
    try {
      const chapters = await store.current.read(current.current, "fixture-book", "fixture-en-v1");
      if (run !== revision.current || !access.current) return;
      opened.current = Boolean(chapters);
      setText(chapters?.map((chapter) => chapter.text).join("\n\n") ?? null);
      setMessage(chapters ? "Reading verified saved fixture text. No network request is needed for this read." : "No saved text for this account and edition. Save it while connected.");
    } catch (cause) {
      if (run === revision.current) { lockAccess(); setError(cause instanceof Error ? cause.message : "Could not open saved text."); }
    }
  }

  async function checkAccess(revoke = false) {
    if (!store.current) return;
    const client = store.current;
    if (!selectedThisMount.current) {
      setError("Select a fixture account online after reloading. Previous text stays locked until a new session clears it.");
      return;
    }
    lockAccess();
    const run = revision.current;
    setOffline(false);
    setError(null);
    try {
      const ticket = current.current ?? await client.context();
      if (run !== revision.current) return;
      if (!ticket.userId) throw new Error("Select a synthetic fixture account first.");
      current.current = ticket;
      setOwner(ticket.userId);
      if (revoke) announceInvalidation(ticket);
      setMessage("Checking fixture access. Saved text is locked until verification succeeds.");
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: ticket.userId, action: revoke ? "revoke" : "check" }) });
      if (pauseCheck.current) {
        setWaiting(true);
        await new Promise<void>((resolve) => { resumeCheck.current = resolve; });
      }
      if (response.status === 401 || response.status === 403 || revoke) { await denyAndClear(ticket); return; }
      if (!response.ok) throw new Error("Access check failed. Text stays locked; retry while connected.");
      const context = await client.context();
      if (run !== revision.current) return;
      if (!sameOwner(context, ticket)) throw new Error("Offline account changed. Select the account again.");
      unlockAccess();
      setMessage("Fixture access checked online. Existing lease unchanged; save again to renew.");
    } catch (cause) {
      if (run === revision.current) setError(cause instanceof Error ? cause.message : "Access check failed. Text stays locked.");
    }
  }

  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header className="space-y-3">
      <p className="text-sm font-semibold text-accent-foreground">Development fixture · synthetic text and isolated test key</p>
      <h1 className="text-3xl font-medium">Offline text reader</h1>
      <p>Production offline downloads remain disabled. This preview exercises the shared lease and account-owned storage code. It does not authenticate a real account or download a real book.</p>
      <p className="text-sm text-muted-foreground">Keep this preview open for offline tests. The production offline app shell, cold start, trusted key provisioning and real access checks are not connected.</p>
    </header>
    <section className="card-base space-y-4 p-5" aria-label="Fixture account">
      <p>Account: <strong>{owner ?? "Logged out"}</strong></p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={!ready || offline} onClick={() => void selectOwner("fixture-reader-a")}>Use fixture account A</button>
        <button className="btn-secondary" disabled={!ready || offline} onClick={() => void selectOwner("fixture-reader-b")}>Use fixture account B</button>
        <button className="btn-secondary" disabled={!ready || !owner} onClick={() => void selectOwner(null)}>Log out and clear</button>
      </div>
      <p className="text-sm">Switching or logging out clears saved text. Repeat in a second tab to test account isolation and delayed downloads.</p>
    </section>
    <section className="card-base space-y-4 p-5" aria-label="Saved text controls">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!unlocked || pending || offline} onClick={() => void save()}>Save text for 24 hours</button>
        <button className="btn-secondary" disabled={!unlocked || pending || offline} onClick={() => void save(true)}>Save 15-second test lease</button>
        <button className="btn-secondary" disabled={!unlocked || pending || offline} onClick={() => void save(false, true)}>Save with delayed response</button>
        <button className="btn-secondary" disabled={!unlocked} onClick={() => void openSaved()}>Open saved text</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={!unlocked || offline} onClick={() => { setOffline(true); setMessage("Fixture offline mode: no downloads or account changes. Saved text still checks its lease."); }}>Go offline in fixture</button>
        <button className="btn-secondary" disabled={!ready || waiting} onClick={() => void checkAccess()}>Reconnect and check access</button>
        <button className="btn-secondary" disabled={!owner || offline} onClick={() => void checkAccess(true)}>Revoke fixture access</button>
      </div>
      {expiry && <p>Offline access until {expiry}</p>}
      <p role="status">{message}</p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    </section>
    <section className="card-base space-y-3 p-5" aria-label="Failure simulation">
      <p className="text-sm">Development-only failure controls. Reload stays locked until an online account selection clears old text; failed cleanup requires selecting an account again.</p>
      <label className="block"><input type="checkbox" onChange={(event) => { failCleanup.current = event.target.checked; }} /> Simulate failed cleanup transaction</label>
      <label className="block"><input type="checkbox" onChange={(event) => { pauseCheck.current = event.target.checked; }} /> Pause access-check response</label>
      <button className="btn-secondary" disabled={!waiting} onClick={() => { const resume = resumeCheck.current; resumeCheck.current = null; setWaiting(false); resume?.(); }}>Release access-check response</button>
    </section>
    {text && <article aria-label="Saved synthetic chapter" className="card-base whitespace-pre-wrap p-6 leading-8">{text}</article>}
  </main>;
}
