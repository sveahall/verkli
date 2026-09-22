"use client";

import { useEffect, useRef, useState } from "react";
import { createIndexedDbOfflineStorage, OwnedOfflineStore, type OfflineDownload, type OfflineOwner } from "@/lib/offline/owned-store";
import { OFFLINE_FIXTURE_AUDIENCE } from "@/lib/offline/lease";

const endpoint = "/api/dev/offline-reader-fixture";
const channelName = "verkli-offline-owned-fixture-v1";

export default function OfflineReaderPreview() {
  const store = useRef<OwnedOfflineStore | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const current = useRef<OfflineOwner | null>(null);
  const revision = useRef(0);
  const opened = useRef(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Opening isolated fixture storage…");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);

  function hideText() {
    revision.current++;
    opened.current = false;
    setText(null);
    setExpiry(null);
    setPending(false);
    setMessage("Saved text is closed. Open it again to verify access.");
  }

  useEffect(() => {
    const generation = revision;
    let disposed = false;
    const events = new BroadcastChannel(channelName);
    channel.current = events;
    async function refresh() {
      if (!store.current) return;
      const run = revision.current;
      try {
        const context = await store.current.context();
        if (disposed || run !== revision.current) return;
        if (context.generation !== current.current?.generation) {
          hideText();
          current.current = context;
          setOwner(context.userId);
          setMessage(context.userId ? "Fixture account restored. Choose Save or Open saved text." : "No account. Select a synthetic fixture account.");
        } else if (opened.current && context.userId) {
          const chapters = await store.current.read(context, "fixture-book", "fixture-en-v1");
          if (!disposed && run === revision.current) setText(chapters?.map((chapter) => chapter.text).join("\n\n") ?? null);
        }
      } catch (cause) {
        if (!disposed && run === revision.current) {
          hideText();
          setError(cause instanceof Error ? cause.message : "Could not read offline storage.");
        }
      }
    }
    events.onmessage = () => { hideText(); void refresh(); };
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
        store.current = new OwnedOfflineStore(createIndexedDbOfflineStorage(channelName), key, () => Date.now(), OFFLINE_FIXTURE_AUDIENCE);
        setReady(true);
        await refresh();
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Could not open fixture.");
      }
    })();
    return () => {
      disposed = true;
      generation.current++;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      events.close();
      channel.current = null;
      store.current = null;
    };
  }, []);

  async function selectOwner(userId: string | null) {
    if (!store.current) return;
    hideText();
    const run = revision.current;
    setError(null);
    try {
      if (userId) {
        if (offline) throw new Error("Reconnect before changing fixture accounts.");
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: userId, action: "restore" }) });
        if (!response.ok) throw new Error("Could not verify fixture account.");
        if (run !== revision.current) return;
      }
      current.current = await store.current.activateOwner(userId);
      setOwner(userId);
      channel.current?.postMessage("changed");
      setMessage(userId ? "Synthetic account selected. Nothing has been saved for it yet." : "Logged out. Saved fixture text cleared in all tabs.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch account."); }
  }

  async function save(shortLease = false, delayed = false) {
    if (!store.current || !current.current?.userId) return;
    const ticket = current.current;
    const run = revision.current;
    setPending(true);
    setError(null);
    setMessage(delayed ? "Downloading fixture; save will wait 3 seconds. Try logging out now." : "Downloading and verifying every chapter…");
    try {
      if (offline) throw new Error("Reconnect to save or renew offline text.");
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: ticket.userId, action: "download", shortLease }) });
      if (response.status === 403 || response.status === 401) {
        await store.current.revoke(ticket);
        channel.current?.postMessage("changed");
        if (run === revision.current) { hideText(); setError("Fixture access revoked. Saved text cleared."); }
        return;
      }
      if (!response.ok) throw new Error("Download failed. Nothing was marked as saved.");
      const download: OfflineDownload = await response.json();
      if (delayed) await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      await store.current.save(ticket, download);
      if (run !== revision.current) return;
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
    if (!store.current || !current.current?.userId) return;
    const run = revision.current;
    setError(null);
    try {
      const chapters = await store.current.read(current.current, "fixture-book", "fixture-en-v1");
      if (run !== revision.current) return;
      opened.current = Boolean(chapters);
      setText(chapters?.map((chapter) => chapter.text).join("\n\n") ?? null);
      setMessage(chapters ? "Reading verified saved fixture text. No network request is needed for this read." : "No saved text for this account and edition. Save it while connected.");
    } catch (cause) {
      if (run === revision.current) { hideText(); setError(cause instanceof Error ? cause.message : "Could not open saved text."); }
    }
  }

  async function checkAccess(revoke = false) {
    if (!store.current || !current.current?.userId) return;
    const ticket = current.current;
    hideText();
    const run = revision.current;
    setOffline(false);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: ticket.userId, action: revoke ? "revoke" : "check" }) });
      if (response.status === 401 || response.status === 403) {
        await store.current.revoke(ticket);
        channel.current?.postMessage("changed");
        throw new Error("Fixture access revoked. Saved text has been cleared.");
      }
      if (!response.ok) throw new Error("Access check failed. The saved lease was not extended.");
      if (run === revision.current) setMessage("Fixture access checked online. Existing lease unchanged; save again to renew.");
    } catch (cause) { if (run === revision.current) setError(cause instanceof Error ? cause.message : "Access check failed."); }
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
        <button className="btn-primary" disabled={!owner || pending || offline} onClick={() => void save()}>Save text for 24 hours</button>
        <button className="btn-secondary" disabled={!owner || pending || offline} onClick={() => void save(true)}>Save 15-second test lease</button>
        <button className="btn-secondary" disabled={!owner || pending || offline} onClick={() => void save(false, true)}>Save with delayed response</button>
        <button className="btn-secondary" disabled={!owner} onClick={() => void openSaved()}>Open saved text</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={!owner || offline} onClick={() => { setOffline(true); setMessage("Fixture offline mode: no downloads or account changes. Saved text still checks its lease."); }}>Go offline in fixture</button>
        <button className="btn-secondary" disabled={!owner} onClick={() => void checkAccess()}>Reconnect and check access</button>
        <button className="btn-secondary" disabled={!owner || offline} onClick={() => void checkAccess(true)}>Revoke fixture access</button>
      </div>
      {expiry && <p>Offline access until {expiry}</p>}
      <p role="status">{message}</p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    </section>
    {text && <article aria-label="Saved synthetic chapter" className="card-base whitespace-pre-wrap p-6 leading-8">{text}</article>}
  </main>;
}
