"use client";

import Link from "next/link";
import {
  AUTHOR_LINE_MAX,
  FLAP_TEXT_MAX,
  applyProfileToCoverCopy,
  type CoverCopy,
} from "@/lib/cover-copy";
import type { CoverCopySaveState } from "../hooks/useCoverCopy";

type CoverCopyCardProps = {
  value: CoverCopy;
  profileBio: string;
  bookTitle: string;
  authorName: string;
  coverUrl: string | null;
  saveState: CoverCopySaveState;
  onChange: (next: CoverCopy) => void;
};

const choiceClass = (selected: boolean) =>
  `min-h-11 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#907AFF] ${
    selected
      ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-foreground"
      : "border-border bg-card text-muted-foreground hover:border-[#907AFF]/30"
  }`;

export default function CoverCopyCard({
  value,
  profileBio,
  bookTitle,
  authorName,
  coverUrl,
  saveState,
  onChange,
}: CoverCopyCardProps) {
  const profileReady = profileBio.trim().length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 dark:bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Back cover</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            A short author line on the back. A dust jacket adds folded flaps for a longer note.
          </p>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : ""}
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cover format">
        <button
          type="button"
          role="radio"
          aria-checked={!value.dustJacket}
          className={choiceClass(!value.dustJacket)}
          onClick={() => onChange({ ...value, dustJacket: false })}
        >
          <span className="block text-[13px] font-semibold text-foreground">Standard cover</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Front, spine and back.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.dustJacket}
          className={choiceClass(value.dustJacket)}
          onClick={() => onChange({ ...value, dustJacket: true })}
        >
          <span className="block text-[13px] font-semibold text-foreground">Dust jacket</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Hardcover wrap with folded flaps.</span>
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="cover-author-line" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Author line
          </label>
          <button
            type="button"
            disabled={!profileReady}
            onClick={() => onChange(applyProfileToCoverCopy(value, profileBio))}
            className="inline-flex min-h-9 items-center rounded-full border border-[#907AFF]/30 bg-[#907AFF]/10 px-3 text-xs font-medium text-accent-foreground transition hover:bg-[#907AFF]/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fetch from profile
          </button>
        </div>
        <textarea
          id="cover-author-line"
          value={value.authorLine}
          maxLength={AUTHOR_LINE_MAX}
          rows={3}
          onChange={(event) => onChange({ ...value, authorLine: event.target.value })}
          placeholder="NN is Professor of Medieval Archaeology at Stockholm University."
          className="input-base min-h-[88px] resize-y leading-relaxed"
        />
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {profileReady ? (
            <span>Taken from About me on your author profile.</span>
          ) : (
            <span>
              Write it under{" "}
              <Link href="/author/profile" className="font-medium text-accent-foreground underline">
                About me
              </Link>{" "}
              on your profile, then fetch it here.
            </span>
          )}
          <span className="tabular-nums">
            {value.authorLine.length}/{AUTHOR_LINE_MAX}
          </span>
        </div>
      </div>

      {value.dustJacket && (
        <div className="mt-5 space-y-4">
          <div className="overflow-x-auto">
            <JacketPreview
              bookTitle={bookTitle}
              authorName={authorName}
              coverUrl={coverUrl}
              authorLine={value.authorLine}
              flapText={value.flapText}
            />
          </div>
          <div>
            <label htmlFor="cover-flap-text" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Flap text
            </label>
            <textarea
              id="cover-flap-text"
              value={value.flapText}
              maxLength={FLAP_TEXT_MAX}
              rows={6}
              onChange={(event) => onChange({ ...value, flapText: event.target.value })}
              placeholder="A longer author note for the folded flap."
              className="input-base min-h-[140px] resize-y leading-relaxed"
            />
            <p className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">
              {value.flapText.length}/{FLAP_TEXT_MAX}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function JacketPreview({
  bookTitle,
  authorName,
  coverUrl,
  authorLine,
  flapText,
}: {
  bookTitle: string;
  authorName: string;
  coverUrl: string | null;
  authorLine: string;
  flapText: string;
}) {
  return (
    <div
      aria-hidden
      className="grid min-w-[520px] grid-cols-[0.72fr_1.15fr_0.22fr_1.15fr_0.72fr] gap-1 overflow-hidden rounded-xl border border-border bg-background p-1"
    >
      <JacketPanel label="Back flap" text={flapText || "Longer author note"} />
      <JacketPanel label="Back" text={authorLine || authorName} />
      <div className="flex items-center justify-center rounded-lg bg-primary px-1 py-3">
        <p className="text-[9px] font-medium uppercase tracking-widest text-primary-foreground [writing-mode:vertical-rl]">
          {bookTitle}
        </p>
      </div>
      <div className="relative min-h-28 overflow-hidden rounded-lg bg-muted">
        {coverUrl ? (
          // Decorative stand-in for the front board. The real cover stays in the preview above.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-2">
            <p className="text-[11px] font-medium text-foreground">{bookTitle}</p>
          </div>
        )}
      </div>
      <JacketPanel label="Front flap" text="Folded in" />
    </div>
  );
}

function JacketPanel({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex min-h-28 flex-col rounded-lg bg-card px-2 py-2 ring-1 ring-border">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 line-clamp-5 text-[10px] leading-snug text-foreground">{text}</p>
    </div>
  );
}
