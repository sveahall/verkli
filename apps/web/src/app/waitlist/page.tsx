"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { resolveErrorMessage } from "@/lib/error-messages";
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, FileText, Globe2, Languages, Plus } from "lucide-react";
import WaitlistProductPreview from "./WaitlistProductPreview";
import "./waitlist.css";
import BookOrderSection from "./BookOrderSection";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

const AUTHOR_STORAGE_EMAIL = "verkli_waitlist_author_email";
const AUTHOR_STORAGE_STATUS = "verkli_waitlist_author_status";
const AUTHOR_STORAGE_POSITION = "verkli_waitlist_author_position";
const READER_STORAGE_EMAIL = "verkli_waitlist_reader_email";
const READER_STORAGE_STATUS = "verkli_waitlist_reader_status";
const READER_STORAGE_POSITION = "verkli_waitlist_reader_position";

const HERO_CTA_LABEL = "Join the waitlist";

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
        setErrorMessage(resolveErrorMessage(data.error));
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(resolveErrorMessage(data.error));
        setState("error");
        return;
      }
      const position = data.position ?? 0;
      const isDuplicate = data.alreadyExists === true;
      try {
        localStorage.setItem(AUTHOR_STORAGE_EMAIL, normalized);
        localStorage.setItem(AUTHOR_STORAGE_STATUS, isDuplicate ? "exists" : "success");
        localStorage.setItem(AUTHOR_STORAGE_POSITION, String(position));
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
        className="wl-signup-input"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="Your email address"
          aria-label="Author email"
          disabled={state === "loading"}
          autoComplete="email"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "waitlist-error" : undefined}
          className="text-[16px]"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="wl-submit"
          aria-busy={state === "loading"}
        >
          {state === "loading" ? "Requesting…" : submitLabel}
        </button>
      </div>
      {errorMessage && (
        <p id="waitlist-error" className="wl-signup-error" role="alert">
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
    >
      <p className="text-[17px] font-semibold text-emerald-900 dark:text-emerald-100">
        You&apos;re on the waitlist
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
      className="rounded-2xl border border-border bg-accent px-6 py-6"
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

const READER_CTA_LABEL = "Join the waitlist";

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
        setErrorMessage(resolveErrorMessage(data.error));
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(resolveErrorMessage(data.error));
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
        className="wl-signup-input"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="Your email address"
          aria-label="Reader email"
          disabled={state === "loading"}
          autoComplete="email"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "reader-waitlist-error" : undefined}
          className="text-[16px]"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="wl-submit"
          aria-busy={state === "loading"}
        >
          {state === "loading" ? "Requesting…" : READER_CTA_LABEL}
        </button>
      </div>
      {errorMessage && (
        <p id="reader-waitlist-error" className="wl-signup-error" role="alert">
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
    >
      <p className="text-[17px] font-semibold text-emerald-900 dark:text-emerald-100">
        You&apos;re on the reader waitlist
      </p>
      <p className="mt-2 text-[15px] text-emerald-800/90 dark:text-emerald-200/90">
        Position <span className="font-bold">#{queuePosition}</span>
        <br />
        We&apos;ll be in touch when it&apos;s your turn.
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
      className="rounded-2xl border border-border bg-accent px-6 py-6"
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

// Noop subscribe for useSyncExternalStore-based hydration detection
const _subNoop = () => () => {};

export default function WaitlistPage() {
  const [audience, setAudience] = useState<"author" | "reader">("author");
  // Initialise from localStorage via lazy initialisers instead of
  // useEffect + setState, avoiding cascading-render warnings.
  const [queuePosition, setQueuePosition] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const status = localStorage.getItem(AUTHOR_STORAGE_STATUS);
      const pos = parseInt(localStorage.getItem(AUTHOR_STORAGE_POSITION) ?? "", 10);
      if (status === "success" && !Number.isNaN(pos)) return pos;
    } catch { /* ignore */ }
    return null;
  });
  const [alreadyExistsPosition, setAlreadyExistsPosition] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const status = localStorage.getItem(AUTHOR_STORAGE_STATUS);
      const pos = parseInt(localStorage.getItem(AUTHOR_STORAGE_POSITION) ?? "", 10);
      if (status === "exists" && !Number.isNaN(pos)) return pos;
    } catch { /* ignore */ }
    return null;
  });
  const [readerQueuePosition, setReaderQueuePosition] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const status = localStorage.getItem(READER_STORAGE_STATUS);
      const pos = parseInt(localStorage.getItem(READER_STORAGE_POSITION) ?? "", 10);
      if (status === "success" && !Number.isNaN(pos)) return pos;
    } catch { /* ignore */ }
    return null;
  });
  const [readerAlreadyExistsPosition, setReaderAlreadyExistsPosition] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const status = localStorage.getItem(READER_STORAGE_STATUS);
      const pos = parseInt(localStorage.getItem(READER_STORAGE_POSITION) ?? "", 10);
      if (status === "exists" && !Number.isNaN(pos)) return pos;
    } catch { /* ignore */ }
    return null;
  });
  // Detect client mount via useSyncExternalStore instead of useEffect + setState
  const hydrated = useSyncExternalStore(_subNoop, () => true, () => false);

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

  const handleAuthorUseDifferentEmail = () => {
    try {
      localStorage.removeItem(AUTHOR_STORAGE_EMAIL);
      localStorage.removeItem(AUTHOR_STORAGE_STATUS);
      localStorage.removeItem(AUTHOR_STORAGE_POSITION);
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
  };

  const joinAsReader = () => {
    setAudience("reader");
    document.getElementById("join-waitlist")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    document.getElementById("reader-role")?.focus({ preventScroll: true });
  };

  return (
    <main className="waitlist-page" id="top">
      <header className="wl-nav wl-shell">
        <a href="#top" className="wl-logo" aria-label="Verkli home">
          <Image src="/logo-dark.svg" alt="Verkli" width={144} height={40} className="dark:hidden" priority /><Image src="/favicon.svg" alt="Verkli" width={144} height={40} className="hidden dark:block" priority />

        </a>
        <nav className="wl-nav-links" aria-label="Main navigation">
          <a href="#how-it-works">The platform</a>
          <a href="#questions">FAQ</a>
          <a href="#join-waitlist" className="wl-nav-cta">Get early access <ArrowUpRight size={14} aria-hidden="true" /></a>
        </nav>
      </header>

      <section className="wl-hero wl-shell" aria-labelledby="waitlist-heading">
        <div className="wl-hero-copy">

          <h1 id="waitlist-heading"><span>Your story.</span><span className="wl-gradient-text">Goes further.</span></h1>
          <p className="wl-intro"><strong>Big imagination. Meet your AI workspace.</strong><br />Write, translate, create audiobooks, and publish. Verkli brings your next chapter together in one place.</p>

          <div className="wl-join" id="join-waitlist">
            <div className="wl-role-switch" role="group" aria-label="Choose your waitlist">
              <button type="button" aria-pressed={audience === "author"} aria-controls="author-signup" onClick={() => setAudience("author")}>I’m an author</button>
              <button type="button" id="reader-role" aria-pressed={audience === "reader"} aria-controls="reader-signup" onClick={() => setAudience("reader")}>I’m a reader</button>
            </div>
            <div id="author-signup" hidden={audience !== "author"}>
              {!hydrated ? <p className="wl-micro" role="status">Loading signup…</p> : queuePosition !== null ? (
                <SuccessState queuePosition={queuePosition} onUseDifferentEmail={handleAuthorUseDifferentEmail} />
              ) : alreadyExistsPosition !== null ? (
                <AlreadyExistsState queuePosition={alreadyExistsPosition} onUseDifferentEmail={handleAuthorUseDifferentEmail} />
              ) : (
                <WaitlistForm onSuccess={handleSuccess} onAlreadyExists={handleAlreadyExists} />
              )}
              <p className="wl-micro">Private pre-launch. Author invitations go out in small waves.</p>
            </div>
            <div id="reader-signup" hidden={audience !== "reader"}>
              {!hydrated ? <p className="wl-micro" role="status">Loading signup…</p> : readerQueuePosition !== null ? (
                <ReaderSuccessState queuePosition={readerQueuePosition} onUseDifferentEmail={handleReaderUseDifferentEmail} />
              ) : readerAlreadyExistsPosition !== null ? (
                <ReaderAlreadyExistsState queuePosition={readerAlreadyExistsPosition} onUseDifferentEmail={handleReaderUseDifferentEmail} />
              ) : (
                <ReaderWaitlistForm onSuccess={handleReaderSuccess} onAlreadyExists={handleReaderAlreadyExists} />
              )}
              <p className="wl-micro">Discover what’s next. Reader invitations go out in small waves.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              document.getElementById("book-order")?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              });
            }}
            aria-label="Beställ Johans bok nedan"
            className="wl-book-link"
          ><span lang="sv">Beställ Johans bok nedan</span> <ArrowDown size={13} aria-hidden="true" /></button>
        </div>
        <WaitlistProductPreview />
      </section>

      <div className="wl-capabilities wl-shell" aria-label="One connected workspace">
        <span>FROM FIRST WORD TO NEW WORLDS</span>
        <div className="wl-capability"><FileText size={17} aria-hidden="true" /> Write & edit</div>
        <div className="wl-capability"><Languages size={17} aria-hidden="true" /> Translate</div>
        <div className="wl-capability"><AudioLines size={17} aria-hidden="true" /> Create audio</div>
        <div className="wl-capability"><Globe2 size={17} aria-hidden="true" /> Publish</div>
      </div>

      <section className="wl-how wl-shell" id="how-it-works" aria-labelledby="how-heading">
        <div className="wl-section-heading">
          <div><h2 id="how-heading">Less switching tools.<br />More making things.</h2></div>
          <p>From the manuscript on your laptop to the book someone can’t put down. Keep the whole journey in one workspace.</p>
        </div>
        <div className="wl-steps">
          <article className="wl-step"><span className="wl-step-number">01 / CREATE</span><h3>Start with your words.</h3><p>Bring your manuscript or start a new chapter. Write, edit, and shape your book in a workspace built for authors.</p><div className="wl-step-tags"><span>Manuscript import</span><span>Chapter editor</span></div></article>
          <article className="wl-step"><span className="wl-step-number">02 / EXPAND</span><h3>Give it a bigger world.</h3><p>Translate your book into new languages and turn your chapters into narrated audio. Review each edition before publishing.</p><div className="wl-step-tags"><span>AI translation</span><span>Audiobook creation</span></div></article>
          <article className="wl-step"><span className="wl-step-number">03 / PUBLISH</span><h3>Find your next reader.</h3><p>Publish on Verkli so readers can discover, read, and listen. Your story becomes part of someone else’s day.</p><div className="wl-step-tags"><span>Ebooks</span><span>Reader library</span></div></article>
        </div>
      </section>

      <section className="wl-reader wl-shell" aria-labelledby="reader-heading">
        <div><h2 id="reader-heading">Your next obsession<br />hasn’t found you. Yet.</h2><p>Discover independent voices. Read a chapter, listen to a story, and find authors you’ll want to follow from the beginning.</p></div>
        <button type="button" className="wl-secondary-cta" onClick={joinAsReader}>Join as a reader <ArrowUpRight size={16} aria-hidden="true" /></button>
      </section>

      <section className="wl-faq wl-shell" id="questions" aria-labelledby="faq-heading">
        <div><h2 id="faq-heading">Before the<br />next chapter.</h2></div>
        <div>
          <details><summary>What is Verkli?<Plus size={17} aria-hidden="true" /></summary><p>Verkli is an AI workspace for authors and a home for readers. Authors can write and edit manuscripts, translate books, create narrated audiobooks, and publish. Readers can discover stories, read, and listen.</p></details>
          <details><summary>Who is the waitlist for?<Plus size={17} aria-hidden="true" /></summary><p>Authors with a manuscript, writers starting something new, and readers looking for independent voices. Choose your role when you join so we can invite you to the right experience.</p></details>
          <details><summary>When can I get access?<Plus size={17} aria-hidden="true" /></summary><p>Verkli is in private pre-launch. We’re inviting authors and readers in small waves. Join the waitlist and we’ll email you when your invitation is ready.</p></details>
          <details><summary>Can I bring a book I’ve already written?<Plus size={17} aria-hidden="true" /></summary><p>Yes. You can import an existing manuscript, work on its chapters, and prepare translations or an audio edition from your text.</p></details>
        </div>
      </section>

      <div className="wl-book-area">
        <div className="wl-book-intro wl-shell"><h2>Ta för er!</h2><p>Looking for Johan’s book? You can order your copy below.</p></div>
        <BookOrderSection />
      </div>
      <footer className="wl-footer wl-shell">
        <a href="#top" className="wl-logo" aria-label="Verkli home"><Image src="/logo-dark.svg" alt="Verkli" width={144} height={40} className="dark:hidden" /><Image src="/favicon.svg" alt="Verkli" width={144} height={40} className="hidden dark:block" /></a>
        <p>Built for the stories only you can tell.</p>
        <a href="#join-waitlist">Be part of the next chapter <ArrowRight size={14} aria-hidden="true" /></a>
      </footer>
    </main>
  );
}
