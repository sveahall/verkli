"use client";

import { useState, useEffect } from "react";
import AuroraBackground from "@/components/AuroraBackground";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

<<<<<<< HEAD
const author_STORAGE_EMAIL = "verkli_waitlist_author_email";
const author_STORAGE_STATUS = "verkli_waitlist_author_status";
const author_STORAGE_POSITION = "verkli_waitlist_author_position";
const READER_STORAGE_EMAIL = "verkli_waitlist_reader_email";
const READER_STORAGE_STATUS = "verkli_waitlist_reader_status";
const READER_STORAGE_POSITION = "verkli_waitlist_reader_position";

const HERO_EYEBROW = "Limited access";
const HERO_HEADLINE = "Join the waitlist to access verkli.";
const HERO_SUBHEADLINE = "Early access is exclusively limited.";
const HERO_CTA_LABEL = "Request access";
const HERO_MICRO = "Limited waitlist. We onboard a small number of authors at a time.";
const CARD_BADGE = "PRIVATE PRE LAUNCH";

type SubmitState = "idle" | "loading" | "success" | "error" | "already_exists";

function WaitlistForm({
  onSuccess,
  onAlreadyExists,
  submitLabel = HERO_CTA_LABEL,
  hiddenRole,
  hiddenSource,
}: {
  onSuccess: (queuePosition: number) => void;
  onAlreadyExists: (queuePosition: number) => void;
  submitLabel?: string;
  hiddenRole?: string;
  hiddenSource?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("Enter your author email.");
      setState("error");
      return;
    }
    if (!validateEmail(trimmed)) {
      setErrorMessage("Please enter a valid email address.");
      setState("error");
      return;
    }
    const normalized = normalizeEmail(trimmed);
    setState("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          ...(hiddenRole && { role: hiddenRole }),
          source: hiddenSource ?? "waitlist_page",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Something went wrong. Try again in a moment.");
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(data.error || "Something went wrong. Try again in a moment.");
        setState("error");
        return;
      }
      const position = data.position ?? 0;
      const isDuplicate = data.alreadyExists === true;
      try {
        localStorage.setItem(author_STORAGE_EMAIL, normalized);
        localStorage.setItem(author_STORAGE_STATUS, isDuplicate ? "exists" : "success");
        localStorage.setItem(author_STORAGE_POSITION, String(position));
      } catch {
        /* ignore */
      }
      if (isDuplicate) {
        setState("already_exists");
        onAlreadyExists(position);
      } else {
        setState("success");
        onSuccess(position);
      }
    } catch {
      setErrorMessage("Something went wrong. Try again in a moment.");
      setState("error");
    }
  };

  if (state === "success") return null;
  if (state === "already_exists") return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/95 transition-all duration-200 focus-within:ring-2 focus-within:ring-[#907AFF]/40 focus-within:ring-offset-2 focus-within:ring-offset-transparent dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-stretch"
        style={{ outline: "none" }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="Your author email"
          disabled={state === "loading"}
          autoComplete="email"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "waitlist-error" : undefined}
          className="min-h-[52px] flex-1 min-w-0 border-0 bg-transparent px-5 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-white/40 sm:px-6"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="waitlist-cta min-h-[52px] shrink-0 bg-slate-900 px-6 py-3 text-[15px] font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90 sm:px-8"
          aria-busy={state === "loading"}
        >
          {state === "loading" ? "Requesting…" : submitLabel}
        </button>
      </div>
      {errorMessage && (
        <p id="waitlist-error" className="text-sm text-amber-700 dark:text-amber-300" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}

function SuccessState({ queuePosition, onUseDifferentEmail }: { queuePosition: number; onUseDifferentEmail?: () => void }) {
  return (
    <div
      className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-6 py-6 backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/10"
      role="status"
      style={{ animation: "waitlist-success-in 0.5s ease-out both" }}
    >
      <p className="text-[17px] font-semibold text-emerald-900 dark:text-emerald-100">
        You're on the waitlist
      </p>
      <p className="mt-2 text-[15px] text-emerald-800/90 dark:text-emerald-200/90">
        Position <span className="font-bold">#{queuePosition}</span>
        <br />
        Early access invites are sent manually in curated waves.
      </p>
      {onUseDifferentEmail && (
        <p className="mt-4">
          <button
            type="button"
            onClick={onUseDifferentEmail}
            className="text-[13px] text-emerald-700 underline hover:no-underline dark:text-emerald-300"
          >
            Use a different email
          </button>
        </p>
      )}
    </div>
  );
}

function AlreadyExistsState({ queuePosition, onUseDifferentEmail }: { queuePosition: number; onUseDifferentEmail?: () => void }) {
  return (
    <div
      className="rounded-2xl border border-slate-300/50 bg-slate-100/80 px-6 py-6 dark:border-slate-600/40 dark:bg-slate-800/50"
      role="status"
    >
      <p className="text-[17px] font-semibold text-slate-800 dark:text-slate-200">
        This email is already on the waitlist.
      </p>
      <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-400">
        You are number <span className="font-bold">#{queuePosition}</span>.
      </p>
      {onUseDifferentEmail && (
        <p className="mt-4">
          <button
            type="button"
            onClick={onUseDifferentEmail}
            className="text-[13px] text-slate-600 underline hover:no-underline dark:text-slate-400"
          >
            Use a different email
          </button>
        </p>
      )}
    </div>
  );
}

// ——— Reader waitlist (separate API + state) ———

const READER_CTA_LABEL = "Request access";
const READER_MICRO = "Limited reader list. We onboard in small waves.";

function ReaderWaitlistForm({
  onSuccess,
  onAlreadyExists,
}: {
  onSuccess: (queuePosition: number) => void;
  onAlreadyExists: (queuePosition: number) => void;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("Enter your email.");
      setState("error");
      return;
    }
    if (!validateEmail(trimmed)) {
      setErrorMessage("Please enter a valid email address.");
      setState("error");
      return;
    }
    const normalized = normalizeEmail(trimmed);
    setState("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/waitlist/reader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "waitlist_page" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Something went wrong. Try again in a moment.");
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(data.error || "Something went wrong. Try again in a moment.");
        setState("error");
        return;
      }
      const position = data.position ?? 0;
      const isDuplicate = data.alreadyExists === true;
      try {
        localStorage.setItem(READER_STORAGE_EMAIL, normalized);
        localStorage.setItem(READER_STORAGE_STATUS, isDuplicate ? "exists" : "success");
        localStorage.setItem(READER_STORAGE_POSITION, String(position));
      } catch {
        /* ignore */
      }
      if (isDuplicate) {
        setState("already_exists");
        onAlreadyExists(position);
      } else {
        setState("success");
        onSuccess(position);
      }
    } catch {
      setErrorMessage("Something went wrong. Try again in a moment.");
      setState("error");
    }
  };

  if (state === "success") return null;
  if (state === "already_exists") return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/95 transition-all duration-200 focus-within:ring-2 focus-within:ring-[#907AFF]/40 focus-within:ring-offset-2 focus-within:ring-offset-transparent dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-stretch"
        style={{ outline: "none" }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="Your email"
          disabled={state === "loading"}
          autoComplete="email"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "reader-waitlist-error" : undefined}
          className="min-h-[52px] flex-1 min-w-0 border-0 bg-transparent px-5 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-white/40 sm:px-6"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="waitlist-cta min-h-[52px] shrink-0 bg-slate-900 px-6 py-3 text-[15px] font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90 sm:px-8"
        >
          {state === "loading" ? "Requesting…" : READER_CTA_LABEL}
        </button>
      </div>
      {errorMessage && (
        <p id="reader-waitlist-error" className="text-sm text-amber-700 dark:text-amber-300" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}

function ReaderSuccessState({ queuePosition, onUseDifferentEmail }: { queuePosition: number; onUseDifferentEmail?: () => void }) {
  return (
    <div
      className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-6 py-6 backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/10"
      role="status"
      style={{ animation: "waitlist-success-in 0.5s ease-out both" }}
    >
      <p className="text-[17px] font-semibold text-emerald-900 dark:text-emerald-100">
        You're on the reader waitlist
      </p>
      <p className="mt-2 text-[15px] text-emerald-800/90 dark:text-emerald-200/90">
        Position <span className="font-bold">#{queuePosition}</span>
        <br />
        We'll be in touch when it's your turn.
      </p>
      {onUseDifferentEmail && (
        <p className="mt-4">
          <button
            type="button"
            onClick={onUseDifferentEmail}
            className="text-[13px] text-emerald-700 underline hover:no-underline dark:text-emerald-300"
          >
            Use a different email
          </button>
        </p>
      )}
    </div>
  );
}

function ReaderAlreadyExistsState({ queuePosition, onUseDifferentEmail }: { queuePosition: number; onUseDifferentEmail?: () => void }) {
  return (
    <div
      className="rounded-2xl border border-slate-300/50 bg-slate-100/80 px-6 py-6 dark:border-slate-600/40 dark:bg-slate-800/50"
      role="status"
    >
      <p className="text-[17px] font-semibold text-slate-800 dark:text-slate-200">
        This email is already on the reader waitlist.
      </p>
      <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-400">
        You are number <span className="font-bold">#{queuePosition}</span>.
      </p>
      {onUseDifferentEmail && (
        <p className="mt-4">
          <button
            type="button"
            onClick={onUseDifferentEmail}
            className="text-[13px] text-slate-600 underline hover:no-underline dark:text-slate-400"
          >
            Use a different email
          </button>
        </p>
      )}
    </div>
  );
}

export default function WaitlistPage() {
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [alreadyExistsPosition, setAlreadyExistsPosition] = useState<number | null>(null);
  const [readerQueuePosition, setReaderQueuePosition] = useState<number | null>(null);
  const [readerAlreadyExistsPosition, setReaderAlreadyExistsPosition] = useState<number | null>(null);
=======
const STORAGE_KEY = "verkli_access_submitted";

type Intent = "author" | "reader";

type SubmitState = "idle" | "loading" | "submitted" | "error";

export default function WaitlistPage() {
  const [intent, setIntent] = useState<Intent>("author");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
>>>>>>> main
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
<<<<<<< HEAD
      const authorStatus = localStorage.getItem(author_STORAGE_STATUS);
      const authorPosition = localStorage.getItem(author_STORAGE_POSITION);
      const pos = authorPosition ? parseInt(authorPosition, 10) : 0;
      if (authorStatus === "success" && !Number.isNaN(pos)) setQueuePosition(pos);
      else if (authorStatus === "exists" && !Number.isNaN(pos)) setAlreadyExistsPosition(pos);

      const readerStatus = localStorage.getItem(READER_STORAGE_STATUS);
      const readerPosition = localStorage.getItem(READER_STORAGE_POSITION);
      const rPos = readerPosition ? parseInt(readerPosition, 10) : 0;
      if (readerStatus === "success" && !Number.isNaN(rPos)) setReaderQueuePosition(rPos);
      else if (readerStatus === "exists" && !Number.isNaN(rPos)) setReaderAlreadyExistsPosition(rPos);
=======
      if (localStorage.getItem(STORAGE_KEY) === "true") setState("submitted");
>>>>>>> main
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

<<<<<<< HEAD
  const handleSuccess = (position: number) => {
    setQueuePosition(position);
    setAlreadyExistsPosition(null);
  };

  const handleAlreadyExists = (position: number) => {
    setAlreadyExistsPosition(position);
    setQueuePosition(null);
  };

  const handleReaderSuccess = (position: number) => {
    setReaderQueuePosition(position);
    setReaderAlreadyExistsPosition(null);
  };

  const handleReaderAlreadyExists = (position: number) => {
    setReaderAlreadyExistsPosition(position);
    setReaderQueuePosition(null);
  };

  const handleauthorUseDifferentEmail = () => {
    try {
      localStorage.removeItem(author_STORAGE_EMAIL);
      localStorage.removeItem(author_STORAGE_STATUS);
      localStorage.removeItem(author_STORAGE_POSITION);
    } catch {
      /* ignore */
    }
    setQueuePosition(null);
    setAlreadyExistsPosition(null);
  };

  const handleReaderUseDifferentEmail = () => {
    try {
      localStorage.removeItem(READER_STORAGE_EMAIL);
      localStorage.removeItem(READER_STORAGE_STATUS);
      localStorage.removeItem(READER_STORAGE_POSITION);
    } catch {
      /* ignore */
    }
    setReaderQueuePosition(null);
    setReaderAlreadyExistsPosition(null);
=======
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("Email required.");
      setState("error");
      return;
    }
    if (!validateEmail(trimmed)) {
      setErrorMessage("Invalid email.");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMessage("");
    const url = intent === "author" ? "/api/waitlist" : "/api/waitlist/reader";
    const body =
      intent === "author"
        ? { email: trimmed, role: "author", source: "waitlist_page" }
        : { email: trimmed, source: "waitlist_page" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Failed.");
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(data.error || "Failed.");
        setState("error");
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        /* ignore */
      }
      setState("submitted");
    } catch {
      setErrorMessage("Failed.");
      setState("error");
    }
>>>>>>> main
  };

  return (
    <>
      <style>{`
        @keyframes waitlist-hero-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
<<<<<<< HEAD
        @keyframes waitlist-success-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
=======
>>>>>>> main
        .waitlist-hero-in {
          animation: waitlist-hero-in 0.7s ease-out both;
        }
        .waitlist-hero-in-delay-1 { animation-delay: 0.1s; }
        .waitlist-hero-in-delay-2 { animation-delay: 0.2s; }
        .waitlist-hero-in-delay-3 { animation-delay: 0.3s; }
        .waitlist-hero-in-delay-4 { animation-delay: 0.4s; }
<<<<<<< HEAD
        .waitlist-hero-in-delay-5 { animation-delay: 0.5s; }
=======
>>>>>>> main
        .waitlist-cta {
          box-shadow: 0 0 32px rgba(144, 122, 255, 0.25);
        }
        .dark .waitlist-cta {
          box-shadow: 0 0 40px rgba(144, 122, 255, 0.35);
        }
      `}</style>
      <main className="waitlist-page relative flex min-h-screen min-h-dvh flex-col" role="main">
        <AuroraBackground />
<<<<<<< HEAD
        {/* Full-viewport hero */}
        <section className="relative flex min-h-screen min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16 dark">

          {/* Logo: no link, decorative only */}
=======
        <section className="relative flex min-h-screen min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16 dark">
>>>>>>> main
          <div
            className="waitlist-hero-in absolute left-0 right-0 top-15 flex justify-center pt-8 sm:pt-10"
            aria-hidden
          >
            <div className="flex items-center">
              <img src="/logo-dark.svg" alt="" className="h-7 w-auto dark:hidden" />
              <img src="/favicon.svg" alt="" className="hidden h-7 w-auto dark:block" />
            </div>
          </div>

<<<<<<< HEAD
          {/* Centered content: headline + floating card */}
          <div className="waitlist-hero-in waitlist-hero-in-delay-1 mx-auto w-full max-w-md text-center md:max-w-4xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50">
              {HERO_EYEBROW}
            </p>
            <h1 className="mt-6 text-[40px] font-bold leading-[1.05] tracking-tight text-white sm:text-[48px] md:text-[56px]">
              {HERO_HEADLINE}
            </h1>
            <p className="mt-5 text-[17px] leading-snug text-white/60">
              {HERO_SUBHEADLINE}
            </p>

            {/* Exclusive label: discreet badge above cards */}
            <p
              className="waitlist-hero-in waitlist-hero-in-delay-2 mt-10 text-[10px] font-medium uppercase tracking-[0.3em] text-white/35"
              aria-hidden
            >
              {CARD_BADGE}
            </p>
            {/* Two signups: author + reader — column on mobile, row on desktop */}
            <div className="waitlist-hero-in waitlist-hero-in-delay-3 mt-3 flex w-full flex-col gap-8 md:flex-row md:items-stretch">
              {/* Join the waitlist as a author */}
              <div className="aurora-card min-w-0 flex-1 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl sm:p-8">
                <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-white/60">
                  Join the waitlist as a author
                </h2>
                <div className="mt-4">
                  {!hydrated ? null : queuePosition !== null ? (
                    <SuccessState queuePosition={queuePosition} onUseDifferentEmail={handleauthorUseDifferentEmail} />
                  ) : alreadyExistsPosition !== null ? (
                    <AlreadyExistsState queuePosition={alreadyExistsPosition} onUseDifferentEmail={handleauthorUseDifferentEmail} />
                  ) : (
                    <>
                      <WaitlistForm
                        onSuccess={handleSuccess}
                        onAlreadyExists={handleAlreadyExists}
                        submitLabel={HERO_CTA_LABEL}
                      />
                      <p className="mt-4 text-[12px] text-white/40 tracking-wide">
                        {HERO_MICRO}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Join the waitlist as a reader */}
              <div className="aurora-card min-w-0 flex-1 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl sm:p-8">
                <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-white/60">
                  Join the waitlist as a reader
                </h2>
                <div className="mt-4">
                  {!hydrated ? null : readerQueuePosition !== null ? (
                    <ReaderSuccessState queuePosition={readerQueuePosition} onUseDifferentEmail={handleReaderUseDifferentEmail} />
                  ) : readerAlreadyExistsPosition !== null ? (
                    <ReaderAlreadyExistsState queuePosition={readerAlreadyExistsPosition} onUseDifferentEmail={handleReaderUseDifferentEmail} />
                  ) : (
                    <>
                      <ReaderWaitlistForm
                        onSuccess={handleReaderSuccess}
                        onAlreadyExists={handleReaderAlreadyExists}
                      />
                      <p className="mt-4 text-[12px] text-white/40 tracking-wide">
                        {READER_MICRO}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
=======
          <div className="waitlist-hero-in mt-15 waitlist-hero-in-delay-1 mx-auto w-full max-w-lg text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50">
              LIMITED PRE LAUNCH
            </p>
            <h1 className="mt-5 text-[42px] font-semibold leading-[1.2] tracking-tight text-white sm:text-[30px] md:text-[42px]">
              <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">verkli</span> {" "}
              is the future platform for modern storytelling
            </h1>
            <p className="mt-5 text-[15px] leading-snug text-white/55">
              verkli is a new publishing platform built for one thing:
              <br />
              To make it radically easier for authors to publish, grow a community and actually earn money
            </p>
            <p className="mt-4 text-[13px] text-white/45">
              This is a private pre-launch. Early access is invite only.<br />
            </p><br />
            <div className="waitlist-hero-in waitlist-hero-in-delay-3 mt-5 w-full max-w-md mx-auto rounded-3xl border border-white/20 bg-white/5 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-8">
              <h3 className="text-[15px] font-semibold leading-snug text-white/55 text-center">Sign up below to join the pre-launch waitlist</h3>

              {hydrated ? (
                state === "submitted" ? (
                  <p className="mt-6 text-[14px] text-white/40 text-center">You&apos;re on the waitlist. We&apos;ll be in touch.</p>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    <div>
                      <p className="block text-[13px] text-white/40 mb-1.5" id="intent-label">
                        Do you write or read?
                      </p>
                      <div
                        role="group"
                        aria-labelledby="intent-label"
                        className="flex rounded-2xl border border-white/20 bg-white/5 p-1 dark:border-white/10 dark:bg-white/5"
                      >
                        {(["author", "reader"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setIntent(value)}
                            disabled={state === "loading"}
                            aria-pressed={intent === value}
                            className="flex-1 min-h-[44px] rounded-xl py-2.5 text-[15px] font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                            style={
                              intent === value
                                ? { background: "rgba(255,255,255,0.12)", color: "white" }
                                : { color: "rgba(255,255,255,0.6)" }
                            }
                          >
                            {value === "author" ? "Author" : "Reader"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-[13px] text-white/40 mb-1.5">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (state === "error") setState("idle");
                        }}
                        placeholder="Email"
                        disabled={state === "loading"}
                        autoComplete="email"
                        aria-invalid={state === "error"}
                        aria-describedby={state === "error" ? "waitlist-error" : undefined}
                        className="w-full min-h-[52px] rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-[15px] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={state === "loading"}
                      className="waitlist-cta w-full min-h-[52px] rounded-2xl bg-slate-900 px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                      aria-busy={state === "loading"}
                    >
                      {state === "loading" ? "…" : "Join waitlist"}
                    </button>
                    {errorMessage && (
                      <p id="waitlist-error" className="text-[13px] text-white/50" role="alert">
                        {errorMessage}
                      </p>
                    )}
                  </form>
                )
              ) : null}
            </div>

            <p className="waitlist-hero-in waitlist-hero-in-delay-4 mt-10 text-center text-[11px] text-white/35 tracking-wide">
              No public launch date announced
            </p>
>>>>>>> main
          </div>
        </section>
      </main>
    </>
  );
}
