"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Headphones, Loader2, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPlayerTime } from "../BookEditorView.helpers";
import styles from "./AudiobookPanel.module.css";

interface AudiobookPreviewPlayerProps {
  audioUrl: string | null;
  bookId: string;
  previewEnabled?: boolean;
  /** Re-signs storage URLs after their fifteen-minute expiry. */
  onRefreshAudioUrl?: () => Promise<void>;
}

const MAX_REFRESH_ATTEMPTS = 2;

export function AudiobookPreviewPlayer({ audioUrl, bookId, onRefreshAudioUrl, previewEnabled = true }: AudiobookPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const resumeAtRef = useRef<number | null>(null);
  const refreshAttemptsRef = useRef(0);
  const refreshingRef = useRef(false);
  const autoplayRef = useRef(false);
  const previewRequestRef = useRef<AbortController | null>(null);
  const effectiveAudioUrl = previewUrl ?? audioUrl;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => previewRequestRef.current?.abort(), []);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
      setPlaybackError(null);
    } catch {
      setPlaying(false);
      setPlaybackError("Could not play the audio. Try Play again, or reload the page.");
    }
  }, []);

  const handleAudioFailure = useCallback(async () => {
    const el = audioRef.current;
    setPlaying(false);
    if (!el || previewUrl || !onRefreshAudioUrl) {
      setPlaybackError("Playback failed. Reload the page and try again.");
      return;
    }
    if (refreshingRef.current) return;
    if (refreshAttemptsRef.current >= MAX_REFRESH_ATTEMPTS) {
      setPlaybackError("Could not load the audio. Reload the page and try again.");
      return;
    }
    refreshingRef.current = true;
    refreshAttemptsRef.current += 1;
    resumeAtRef.current = el.currentTime;
    try {
      await onRefreshAudioUrl();
    } catch {
      setPlaybackError("Could not refresh the audio link. Reload the page.");
    } finally {
      refreshingRef.current = false;
    }
  }, [onRefreshAudioUrl, previewUrl]);

  const handleGeneratePreview = async () => {
    if (previewLoading || !previewEnabled) return;
    const controller = new AbortController();
    previewRequestRef.current = controller;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/audiobook/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}), signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPreviewError(body?.detail ?? "Could not create a preview. Please try again.");
        return;
      }
      const blob = await res.blob();
      if (controller.signal.aborted) return;
      autoplayRef.current = true;
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      if (!controller.signal.aborted) setPreviewError("Could not create a preview. Check your connection and try again.");
    } finally {
      if (!controller.signal.aborted) setPreviewLoading(false);
    }
  };

  return (
    <section className={styles.player} aria-label="Audiobook listening">
      {effectiveAudioUrl && <audio ref={audioRef} src={effectiveAudioUrl} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onEmptied={() => { setCurrentTime(0); setDuration(0); setPlaying(false); }}
        onTimeUpdate={() => { if (audioRef.current) { setCurrentTime(audioRef.current.currentTime); if (!audioRef.current.paused) refreshAttemptsRef.current = 0; } }}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (!el) return;
          setDuration(Number.isFinite(el.duration) ? el.duration : 0);
          el.playbackRate = speed;
          const resumeAt = resumeAtRef.current;
          resumeAtRef.current = null;
          if (resumeAt !== null && Number.isFinite(resumeAt)) el.currentTime = Math.min(resumeAt, Number.isFinite(el.duration) ? el.duration : resumeAt);
          if (resumeAt !== null || autoplayRef.current) { autoplayRef.current = false; void play(); }
        }}
        onError={() => void handleAudioFailure()}
      />}
      <div className={styles.playerHeading}>
        <span className={styles.listeningIcon}><Headphones size={24} aria-hidden /></span>
        <div><h3>{effectiveAudioUrl ? previewUrl ? "Your voice preview" : "Your audio edition" : "Hear it first."}</h3><p>{effectiveAudioUrl ? "Listen closely. Your story sets the pace." : "Try a short voice sample before creating your audiobook."}</p></div>
        {!effectiveAudioUrl && <button type="button" onClick={() => void handleGeneratePreview()} disabled={previewLoading || !previewEnabled} className={styles.previewButton}>
          {previewLoading ? <Loader2 size={17} className={styles.spin} aria-hidden /> : <Play size={16} aria-hidden />}
          {previewLoading ? "Creating preview…" : "Preview voice"}
        </button>}
      </div>
      {previewLoading && <p role="status" className={styles.playerNote}>Preparing your sample. This can take a moment.</p>}
      {!previewEnabled && !effectiveAudioUrl && <p className={styles.playerNote}>Voice previews are temporarily unavailable.</p>}
      {effectiveAudioUrl && <div className={styles.playback}>
        <input type="range" aria-label="Audio position" min={0} max={duration || 0} step={0.1} value={Math.min(currentTime, duration)} disabled={!duration} onChange={(event) => { const value = Number(event.target.value); if (audioRef.current) { audioRef.current.currentTime = value; setCurrentTime(value); } }} />
        <div className={styles.playbackControls}>
          <span className={styles.time}>{formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}</span>
          <div className={styles.transport}>
            <button type="button" aria-label="Back 30 seconds" disabled={!duration} onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 30); }}><RotateCcw size={19} aria-hidden /><span>30</span></button>
            <button type="button" aria-label={playing ? "Pause audio" : "Play audio"} className={styles.playButton} onClick={() => { if (playing) audioRef.current?.pause(); else void play(); }}>{playing ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}</button>
            <button type="button" aria-label="Forward 30 seconds" disabled={!duration} onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 30); }}><RotateCw size={19} aria-hidden /><span>30</span></button>
          </div>
          <button type="button" aria-label="Playback speed" title="Change playback speed" onClick={() => { const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]; const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }}>{speed === 1 ? "1.0" : speed}×</button>
        </div>
        {previewUrl && audioUrl && <button className={styles.fullAudioLink} type="button" onClick={() => { audioRef.current?.pause(); autoplayRef.current = false; setPreviewUrl(null); setPlaybackError(null); }}>Listen to full audiobook <ArrowRight size={15} aria-hidden /></button>}
      </div>}
      {(playbackError || previewError) && <p role="alert" className={styles.playerError}>{playbackError || previewError}</p>}
    </section>
  );
}

interface AudiobookCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  audiobookError: string | null;
  audiobookCheckoutLoading: boolean;
  onCheckout: () => void;
}

export function AudiobookCheckoutModal({ open, onClose, audiobookError, audiobookCheckoutLoading, onCheckout }: AudiobookCheckoutModalProps) {
  const router = useRouter();
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !audiobookCheckoutLoading) onClose(); }} aria-label="Create your audiobook">
      <DialogHeader className={styles.checkoutHeading}><DialogTitle>Create your audiobook</DialogTitle><button type="button" aria-label="Close" onClick={onClose} disabled={audiobookCheckoutLoading}><X size={20} aria-hidden /></button></DialogHeader>
      <DialogBody>
        <p className={styles.checkoutIntro}>Turn your full manuscript into an audio edition.</p>
        <div className={styles.checkoutPrice}><div><strong>Pay per audiobook</strong><p>One full book · one payment</p></div><span>299 kr</span></div>
        <p className={styles.hint}>You’ll review the payment in checkout before paying.</p>
        <button type="button" className={styles.planLink} disabled={audiobookCheckoutLoading} onClick={() => { onClose(); router.push("/author/billing"); }}><div><strong>Looking for PRO?</strong><span>Compare plans and chapter-level controls</span></div><ArrowRight size={18} aria-hidden /></button>
        {audiobookError && <p role="alert" className={styles.error}>{audiobookError}</p>}
      </DialogBody>
      <DialogFooter><button type="button" onClick={onCheckout} disabled={audiobookCheckoutLoading} className={styles.generate}>{audiobookCheckoutLoading ? "Opening checkout…" : "Continue to checkout"}</button></DialogFooter>
    </Dialog>
  );
}
