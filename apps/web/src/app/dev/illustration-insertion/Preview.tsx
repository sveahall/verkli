"use client";

import { useCallback, useMemo, useState } from "react";
import type { IllustrationDrafts } from "@/components/editor/TiptapEditor";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const TiptapEditor = dynamic(() => import("@/components/editor/TiptapEditor"), { ssr: false });
const TiptapRenderer = dynamic(() => import("@/components/editor/TiptapRenderer"), { ssr: false });
const bookId = "11111111-1111-4111-8111-111111111111";
const editionId = "22222222-2222-4222-8222-222222222222";
const first = "33333333-3333-4333-8333-333333333333";
const second = "55555555-5555-4555-8555-555555555555";
const initial = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "My existing manuscript." }] }] };

export default function Preview() {
  const illustrationDrafts = useMemo<IllustrationDrafts>(() => new Map(), []);
  const [chapterId, setChapter] = useState(first);
  const [saved, setSaved] = useState<Record<string, Record<string, unknown>>>(() => { try { return typeof window === "undefined" ? {} : JSON.parse(localStorage.getItem("illustration-insertion-demo") ?? "{}"); } catch { return {}; } });
  const [failSave, setFailSave] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const [reader, setReader] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const save = useCallback((content: Record<string, unknown>) => {
    if (failSave) return;
    setSaved((previous) => { const next = { ...previous, [chapterId]: content }; localStorage.setItem("illustration-insertion-demo", JSON.stringify(next)); return next; });
    setDirty(false);
    setSaveCount((value) => value + 1);
  }, [chapterId, failSave]);
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4 text-foreground">
    <h1 className="text-2xl font-display">Illustration insertion QA</h1>
    <p>Development only. Real editor and reader components, synthetic network responses supplied by the test. Autosave is browser-local; no live book is changed.</p>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setChapter(chapterId === first ? second : first)}>Switch chapter</Button><Button variant="secondary" onClick={() => { void createClient().auth.signOut({ scope: "local" }); }}>Switch account</Button><Button variant="secondary" onClick={() => setReader(!reader)}>Toggle reader preview</Button></div>
    <Button variant="secondary" onClick={() => { const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: "66666666-6666-4666-8666-666666666666", exp: 4102444800 }))}.synthetic-signature`; void createClient().auth.setSession({ access_token: token, refresh_token: "synthetic-refresh-token" }).then(({ error }) => setSessionError(error?.message ?? "")); }}>Start synthetic author session</Button>
    {sessionError && <p role="alert">{sessionError}</p>}
    <Button variant="secondary" onClick={() => setFailSave(!failSave)}>{failSave ? "Restore local saves" : "Simulate failed save"}</Button>
    <output data-testid="save-count">{saveCount}</output>
    <p data-testid="save-state">{dirty ? "Unsaved changes" : "Saved locally"}</p>
    <div className="h-[650px] overflow-hidden rounded-2xl border border-border"><TiptapEditor key={chapterId} content={saved[chapterId] ?? initial} onUpdate={save} onDirty={() => setDirty(true)} bookId={bookId} chapterId={chapterId} editionId={editionId} illustrationOwnerId="66666666-6666-4666-8666-666666666666" illustrationDrafts={illustrationDrafts} /></div>
    {reader && <section aria-label="Reader preview"><TiptapRenderer content={saved[chapterId] ?? initial} /></section>}
  </main>;
}
