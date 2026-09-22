"use client";

import { useEffect, useRef, useState } from "react";
import AudioTextSync from "../../(reader-browse)/reader/read/[chapterId]/AudioTextSync";
import ChapterAudiobookPlayer from "../../(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer";
import ReaderChapterBody from "../../(reader-browse)/reader/read/[chapterId]/components/ReaderChapterBody";
import type { AudioTiming } from "@/lib/audiobook/timing";

const BOOK = "audio-sync-fixture";
const TEXTS = { first: "One two three.", second: "Four five six.", swedish: "Ett två tre." };
type Chapter = keyof typeof TEXTS;
type Mode = "timed" | "missing" | "mismatch" | "delayed" | "error";

// Three deterministic tone bursts at [1,2), [4,5), [7,8), with silence between.
// These timestamps describe this fixture only; they are never provider evidence.
function fixtureAudio() {
  const rate = 8000;
  const samples = rate * 30;
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => Array.from(value).forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const burst = [1, 4, 7].some((start) => t >= start && t < start + 1);
    view.setInt16(44 + i * 2, burst ? Math.sin(t * 220 * 2 * Math.PI) * 900 : 0, true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function fixtureTiming(sourceText: string): AudioTiming {
  return { sourceText, words: Array.from(sourceText.matchAll(/\S+/g), (match, i) => ({
    word: match[0], startOffset: match.index, endOffset: match.index + match[0].length, start: 1 + i * 3, end: 2 + i * 3,
  })) };
}

export default function AudioSyncFixture() {
  const [ready, setReady] = useState(false);
  const [chapter, setChapter] = useState<Chapter>("first");
  const [mode, setMode] = useState<Mode>("timed");
  const [resume, setResume] = useState(false);
  const state = useRef({ mode, resume });
  useEffect(() => {
    const originalFetch = window.fetch;
    const audioUrl = URL.createObjectURL(fixtureAudio());
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (url.pathname === `/api/books/${BOOK}/audiobook/play`) {
        const captured = state.current;
        const id = url.searchParams.get("chapterId") as Chapter;
        const sourceText = TEXTS[id];
        if (!sourceText) return Response.json({ error: "FIXTURE_CHAPTER_NOT_FOUND" }, { status: 404 });
        if (captured.mode === "delayed") await new Promise((resolve) => setTimeout(resolve, 1200));
        if (captured.mode === "error") return Response.json({ error: "AUDIO_SIGN_FAILED" }, { status: 503 });
        return Response.json({ audioUrl, timing: captured.mode === "missing" ? null : fixtureTiming(captured.mode === "mismatch" ? "Old manuscript text." : sourceText), resumePositionSeconds: captured.resume ? 7.5 : null });
      }
      if (url.pathname === `/api/books/${BOOK}/audiobook/progress`) return Response.json({ ok: true });
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return Response.json({ error: "LOCAL_FIXTURE_ONLY" }, { status: 403 });
      return originalFetch(input, init);
    };
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => { window.clearTimeout(readyTimer); window.fetch = originalFetch; URL.revokeObjectURL(audioUrl); };
  }, []);
  const key = `${chapter}:${mode}:${resume}`;
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">Audio synchronization — local fixture</h1>
    <p>Synthetic tones, synthetic timing and local responses only. No speech provider, voice recording or real delivery. Bursts: 1–2, 4–5 and 7–8 seconds.</p>
    <div className="flex flex-wrap gap-4">
      <label>Chapter / edition <select aria-label="Chapter / edition" value={chapter} onChange={(e) => setChapter(e.target.value as Chapter)}>
        <option value="first">English chapter 1</option><option value="second">English chapter 2</option><option value="swedish">Swedish edition</option>
      </select></label>
      <label>Timing <select aria-label="Timing" value={mode} onChange={(e) => { const mode = e.target.value as Mode; state.current = { ...state.current, mode }; setMode(mode); }}>
        <option value="timed">Valid timing</option><option value="missing">Missing timing</option><option value="mismatch">Changed manuscript</option><option value="delayed">Delayed response</option><option value="error">Load error</option>
      </select></label>
      <label><input type="checkbox" checked={resume} onChange={(e) => { const resume = e.target.checked; state.current = { ...state.current, resume }; setResume(resume); }} /> Resume at 7.5 seconds</label>
    </div>
    {ready ? <AudioTextSync key={key}>
      <ReaderChapterBody chapterTitle="Fixture chapter" chapterContent={JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: TEXTS[chapter] }] }] })} bodyStyle={{}} />
      <ChapterAudiobookPlayer bookId={BOOK} chapterId={chapter} audiobookStatus="ready" />
    </AudioTextSync> : <p role="status">Preparing fixture…</p>}
  </main>;
}
