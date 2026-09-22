"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeWordAt, canMapAudioTiming, type AudioTiming } from "@/lib/audiobook/timing";
import { collectTextNodeIndex, createRangeFromOffsets, getCssHighlightsMap, getHighlightConstructor } from "./ReaderChapterClient.helpers";

type Sync = { update: (audio: HTMLAudioElement, timing: AudioTiming | null) => void; clear: () => void; status: "waiting" | "ready" | "unavailable" };
const AudioSyncContext = createContext<Sync>({ update: () => {}, clear: () => {}, status: "waiting" });
export const useAudioTextSync = () => useContext(AudioSyncContext);
const BUCKET = "reader-audio-word";

/** Owns only a CSS Highlight range; manuscript DOM and saved reader highlights stay intact. */
export default function AudioTextSync({ children, textOffset = 0 }: { children: ReactNode; textOffset?: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const indexRef = useRef<ReturnType<typeof collectTextNodeIndex> | null>(null);
  const indexedRootRef = useRef<HTMLElement | null>(null);
  const timingRef = useRef<AudioTiming | null>(null);
  const wordRef = useRef<number | null>(null);
  const [status, setStatus] = useState<Sync["status"]>("waiting");

  const clear = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    wordRef.current = null;
    getCssHighlightsMap()?.delete(BUCKET);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => { indexRef.current = null; });
    if (rootRef.current) observer.observe(rootRef.current, { subtree: true, childList: true, characterData: true });
    return () => { observer.disconnect(); clear(); };
  }, [clear]);

  const update = useCallback((audio: HTMLAudioElement, timing: AudioTiming | null) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const tick = () => {
      frameRef.current = null;
      const registry = getCssHighlightsMap();
      const Highlight = getHighlightConstructor();
      const prose = rootRef.current?.querySelector<HTMLElement>("[data-audio-sync-text] .ProseMirror");
      if (!timing || !prose || !registry || !Highlight) {
        clear();
        setStatus("unavailable");
        return;
      }
      if (!indexRef.current || indexedRootRef.current !== prose || timingRef.current !== timing) {
        indexRef.current = collectTextNodeIndex(prose);
        indexedRootRef.current = prose;
        timingRef.current = timing;
        wordRef.current = null;
        registry.delete(BUCKET);
        if (!canMapAudioTiming(timing, indexRef.current.map((item) => item.node.textContent).join(""), textOffset)) {
          indexRef.current = null;
          setStatus("unavailable");
          return;
        }
      }
      setStatus("ready");
      const word = activeWordAt(timing.words, audio.currentTime);
      // A removed duplicate title is narrated but intentionally not highlighted.
      const offset = word && word.startOffset >= textOffset ? word.startOffset : null;
      if (offset !== wordRef.current) {
        wordRef.current = offset;
        registry.delete(BUCKET);
        if (word && offset !== null) {
          const range = createRangeFromOffsets(indexRef.current, offset - textOffset, word.endOffset - textOffset);
          if (range) registry.set(BUCKET, new Highlight(range));
        }
      }
      if (!audio.paused && !audio.ended) frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [clear, textOffset]);
  const value = useMemo(() => ({ update, clear, status }), [update, clear, status]);

  return <AudioSyncContext.Provider value={value}>
    <div ref={rootRef}>
      <style>{`::highlight(reader-audio-word) { background-color: #fde68a; color: #1c1917; }`}</style>
      {children}
    </div>
  </AudioSyncContext.Provider>;
}
