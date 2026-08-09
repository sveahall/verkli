"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AuroraBackground from "@/components/AuroraBackground";
import {
  APPLY_QUESTIONS,
  visibleFields,
  type ApplyField,
  type ApplyQuestion,
} from "@/lib/apply/questions";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitState = "idle" | "loading" | "submitted" | "error";

/**
 * The invitation email links here with the recipient's address in `?e=`, purely
 * to save them typing it. It is not trusted for anything: the server matches
 * the submitted address against the waitlist itself.
 */
function emailFromQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    const value = new URLSearchParams(window.location.search).get("e") ?? "";
    return EMAIL_REGEX.test(value.trim()) ? value.trim() : "";
  } catch {
    return "";
  }
}

const labelClass = "block text-[13px] text-white/45 mb-1.5";
const fieldClass =
  "w-full min-h-[52px] rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none focus:ring-0 disabled:opacity-50";

type Step = { kind: "identity" } | { kind: "question"; question: ApplyQuestion };

export default function ApplyPage() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(emailFromQuery);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps: Step[] = [
    { kind: "identity" },
    ...APPLY_QUESTIONS.filter((q) => !q.showIf || q.showIf(answers)).map(
      (question) => ({ kind: "question" as const, question })
    ),
  ];

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;

  // Move focus to the new question so keyboard and screen-reader users aren't
  // left at the top of the document after advancing.
  useEffect(() => {
    headingRef.current?.focus();
  }, [safeIndex]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  const goNext = () => {
    setErrorMessage("");
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setErrorMessage("");
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const setAnswer = (question: ApplyQuestion, field: ApplyField, value: string) => {
    const next = { ...answers, [field.id]: value };
    setAnswers(next);
    setErrorMessage("");

    // Picking an option completes the question only when it opens no follow-up.
    // Otherwise the flow would skip past the fields it just revealed.
    const opensFollowUp =
      field.id === question.id && visibleFields(question, next).length > 1;

    if (field.kind === "choice" && !opensFollowUp && !isLast) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(goNext, 260);
    }
  };

  const validateStep = (): string | null => {
    if (step.kind === "identity") {
      if (!firstName.trim()) return "Please tell us your name.";
      if (!EMAIL_REGEX.test(email.trim()))
        return "That email address doesn’t look right.";
      return null;
    }

    for (const field of visibleFields(step.question, answers)) {
      const value = (answers[field.id] ?? "").trim();
      if (field.required && !value) return "This one we do need.";
      if (field.kind === "url" && value && !/^https?:\/\//i.test(value)) {
        return "Links need to start with http:// or https://";
      }
    }
    return null;
  };

  const submit = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          answers,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok !== true) {
        if (data.error === "RATE_LIMIT_EXCEEDED") {
          setErrorMessage("Too many attempts. Try again in a few minutes.");
        } else if (data.error === "INVALID_EMAIL") {
          setErrorMessage("That email address doesn’t look right.");
        } else {
          setErrorMessage("Something went wrong on our end. Please try again.");
        }
        setState("error");
        return;
      }
      setState("submitted");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      setErrorMessage("Couldn’t reach us just now. Please try again.");
      setState("error");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateStep();
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    if (isLast) {
      void submit();
      return;
    }
    goNext();
  };

  const busy = state === "loading";
  const progress = Math.round(((safeIndex + 1) / steps.length) * 100);

  return (
    <>
      <style>{`
        html, body { background-color: #070914; }
        @keyframes apply-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes apply-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apply-in { animation: apply-in 0.7s ease-out both; }
        .apply-in-delay-1 { animation-delay: 0.1s; }
        .apply-in-delay-2 { animation-delay: 0.2s; }
        .apply-step-in { animation: apply-step-in 0.32s ease-out both; }
        .apply-cta { box-shadow: 0 0 40px rgba(144, 122, 255, 0.35); }
        @media (prefers-reduced-motion: reduce) {
          .apply-in, .apply-step-in { animation: none; }
        }
      `}</style>

      <main className="relative flex min-h-screen min-h-dvh flex-col" role="main">
        <AuroraBackground />

        <section className="dark relative flex min-h-screen min-h-dvh flex-col items-center justify-center px-4 py-14">
          <div className="apply-in mb-8 flex justify-center">
            <img src="/favicon.svg" alt="Verkli" className="h-7 w-auto" />
          </div>

          <div className="apply-in apply-in-delay-1 mx-auto w-full max-w-lg text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50">
              Round one · Private beta
            </p>
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.2] tracking-tight text-white sm:text-[36px]">
              Apply for{" "}
              <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">
                round one
              </span>
            </h1>
            {/* Utan detta vet den som landar här inte vad hen ansöker till. */}
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              A small group of authors will publish the first books built end
              to end on Verkli — translations, audiobook, cover and
              distribution. You’d be early, so you’ll hit rough edges, and
              telling us about them is part of the job.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/40">
              Six questions is the whole application.
            </p>
          </div>

          <div className="apply-in apply-in-delay-2 mx-auto mt-7 w-full max-w-lg rounded-3xl border border-white/20 bg-[#0a0c18]/80 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-8">
            {!hydrated ? (
              <div className="min-h-[300px]" />
            ) : state === "submitted" ? (
              <div className="py-6 text-center">
                <h2 className="text-[20px] font-semibold text-white">
                  Your application is in.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-white/60">
                  We read every one of these ourselves. You’ll hear from us
                  either way once round one is decided — you keep your place on
                  the list regardless.
                </p>
                <p className="mt-4 text-[14px] leading-relaxed text-white/40">
                  If there’s something about your book that didn’t fit in the
                  questions, reply to the email that brought you here and tell
                  us about it.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-7">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/40">
                      {step.kind === "identity" ? "About you" : "Your writing"}
                    </span>
                    <span className="text-[12px] tabular-nums text-white/35">
                      {safeIndex + 1} / {steps.length}
                    </span>
                  </div>
                  <div
                    className="h-[3px] w-full overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Application progress"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] transition-[width] duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* One question at a time. The key restarts the entrance animation. */}
                <div key={safeIndex} className="apply-step-in min-h-[236px]">
                  {step.kind === "identity" ? (
                    <>
                      <h2
                        ref={headingRef}
                        tabIndex={-1}
                        className="text-[21px] font-semibold leading-snug text-white outline-none"
                      >
                        First, who are we writing back to?
                      </h2>
                      <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="firstName" className={labelClass}>
                              First name
                            </label>
                            <input
                              id="firstName"
                              type="text"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              disabled={busy}
                              autoComplete="given-name"
                              className={fieldClass}
                            />
                          </div>
                          <div>
                            <label htmlFor="lastName" className={labelClass}>
                              Last name
                            </label>
                            <input
                              id="lastName"
                              type="text"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              disabled={busy}
                              autoComplete="family-name"
                              className={fieldClass}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="email" className={labelClass}>
                            Email
                          </label>
                          <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={busy}
                            autoComplete="email"
                            className={fieldClass}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <QuestionStep
                      headingRef={headingRef}
                      question={step.question}
                      answers={answers}
                      onChange={(field, value) =>
                        setAnswer(step.question, field, value)
                      }
                      disabled={busy}
                    />
                  )}
                </div>

                {errorMessage ? (
                  <p className="mt-4 text-[13px] text-white/60" role="alert">
                    {errorMessage}
                  </p>
                ) : null}

                <div className="mt-7 flex items-center gap-3">
                  {safeIndex > 0 ? (
                    <button
                      type="button"
                      onClick={goBack}
                      disabled={busy}
                      className="min-h-[52px] rounded-2xl px-5 text-[15px] font-medium text-white/55 transition-colors hover:text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    >
                      Back
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    disabled={busy}
                    aria-busy={busy}
                    className="apply-cta ml-auto min-h-[52px] flex-1 rounded-2xl bg-white px-6 text-[15px] font-medium text-slate-900 transition-colors hover:bg-white/90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    {busy ? "…" : isLast ? "Send application" : "Continue"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="apply-in apply-in-delay-2 mx-auto mt-7 max-w-lg text-center text-[12px] leading-relaxed text-white/35">
            No manuscript needed yet — only the questions.
          </p>
        </section>
      </main>
    </>
  );
}

function QuestionStep({
  headingRef,
  question,
  answers,
  onChange,
  disabled,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  question: ApplyQuestion;
  answers: Record<string, string>;
  onChange: (field: ApplyField, value: string) => void;
  disabled: boolean;
}) {
  const fields = visibleFields(question, answers);
  const [primary, ...followUps] = fields;
  const helpId = primary.help ? `${primary.id}-help` : undefined;

  return (
    <>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-[21px] font-semibold leading-snug text-white outline-none"
      >
        {primary.label}
      </h2>

      {primary.help ? (
        <p id={helpId} className="mt-2.5 text-[14px] leading-relaxed text-white/45">
          {primary.help}
        </p>
      ) : null}

      <div className="mt-6">
        <FieldInput
          field={primary}
          value={answers[primary.id] ?? ""}
          onChange={(value) => onChange(primary, value)}
          disabled={disabled}
          describedBy={helpId}
        />
      </div>

      {followUps.map((field) => (
        <div key={field.id} className="apply-step-in mt-6 border-t border-white/10 pt-6">
          <label htmlFor={field.id} className={labelClass}>
            {field.label}
            {!field.required ? (
              <span className="text-white/25"> · optional</span>
            ) : null}
          </label>
          {field.help ? (
            <p
              id={`${field.id}-help`}
              className="mb-2.5 text-[13px] leading-relaxed text-white/35"
            >
              {field.help}
            </p>
          ) : null}
          <FieldInput
            field={field}
            value={answers[field.id] ?? ""}
            onChange={(value) => onChange(field, value)}
            disabled={disabled}
            describedBy={field.help ? `${field.id}-help` : undefined}
          />
        </div>
      ))}
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  field: ApplyField;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  describedBy?: string;
}) {
  if (field.kind === "choice") {
    return (
      <fieldset className="w-full border-0 p-0">
        <legend className="sr-only">{field.label}</legend>
        <div className="space-y-2.5">
          {(field.options ?? []).map((option) => {
            const id = `${field.id}-${option.value}`;
            const selected = value === option.value;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] transition-colors ${
                  selected
                    ? "border-white/40 bg-white/[0.14] text-white"
                    : "border-white/15 bg-white/5 text-white/65 hover:border-white/30 hover:text-white/85"
                } ${disabled ? "opacity-50" : ""}`}
              >
                <input
                  id={id}
                  type="radio"
                  name={field.id}
                  value={option.value}
                  checked={selected}
                  onChange={() => onChange(option.value)}
                  disabled={disabled}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-white bg-white" : "border-white/30"
                  }`}
                >
                  {selected ? (
                    <span className="h-[7px] w-[7px] rounded-full bg-slate-900" />
                  ) : null}
                </span>
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "long") {
    return (
      <textarea
        id={field.id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={6}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
        className={`${fieldClass} resize-y leading-relaxed`}
      />
    );
  }

  return (
    <input
      id={field.id}
      type={field.kind === "url" ? "url" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      aria-describedby={describedBy}
      className={fieldClass}
    />
  );
}
