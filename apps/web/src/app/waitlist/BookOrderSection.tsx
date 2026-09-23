"use client";

import { useState } from "react";
import Image from "next/image";
import { TA_FOR_ER_ORDER, TA_FOR_ER_EBOOK } from "@/lib/orders/ta-for-er";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitState = "idle" | "loading" | "error";
type Edition = "print" | "ebook";

const inputClass =
  "min-h-[52px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const labelClass = "mb-1.5 block text-left text-[12px] font-medium tracking-wide text-muted-foreground";

/**
 * Anonymous order card for the waitlist page. Two editions of the same book:
 * a printed copy that needs a shipping address, and a download that needs
 * only an email. Both hand off to a Stripe Checkout session created
 * server-side at /api/order/ta-for-er.
 *
 * The edition is posted along and re-decided on the server, so the price is
 * never taken from the browser.
 */
export default function BookOrderSection() {
  const [edition, setEdition] = useState<Edition>("print");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "loading") return;

    // A download has nowhere to be delivered, so asking for an address would
    // be asking for a home address to send someone a file.
    if (edition === "print" && (!name.trim() || !line1.trim() || !postalCode.trim() || !city.trim())) {
      setErrorMessage("Fyll i namn och fullständig leveransadress.");
      setState("error");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrorMessage("Ange en giltig e-postadress.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/order/ta-for-er", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: edition,
          name: name.trim(),
          email: email.trim(),
          line1: line1.trim(),
          line2: line2.trim(),
          postalCode: postalCode.trim(),
          city: city.trim(),
          phone: phone.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.url) {
        setErrorMessage(
          res.status === 503
            ? "Beställning är inte tillgänglig just nu. Försök igen senare."
            : "Något gick fel. Försök igen om en liten stund.",
        );
        setState("error");
        return;
      }
      // Hand off to Stripe Checkout (the payment link).
      window.location.href = data.url as string;
    } catch {
      setErrorMessage("Något gick fel. Försök igen om en liten stund.");
      setState("error");
    }
  };

  const clearError = () => {
    if (state === "error") setState("idle");
  };

  const isEbook = edition === "ebook";

  return (
    <section id="book-order" className="relative scroll-mt-8 px-4 pb-24 pt-2" aria-labelledby="book-order-heading">
      <div className="wl-order-shell mx-auto w-full max-w-md">
        <div className="wl-order-card rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="wl-order-summary">
            {/* The book itself. Selling a physical book with no picture of it is
                part of why it went unnoticed on a phone. Dimensions are the true
                A5 ratio of the print file, so nothing shifts as it loads. */}
            <div className="mb-5 flex justify-center">
              <Image
                src="/ta-for-er-cover.jpg"
                alt={`Omslag: ${TA_FOR_ER_ORDER.bookTitle} av ${TA_FOR_ER_ORDER.authorName}`}
                width={300}
                height={426}
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 150px, 136px"
                priority
                className="h-auto w-[136px] rounded-xl shadow-surface-lg ring-1 ring-border sm:w-[150px]"
              />
            </div>
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Beställ boken
            </p>
            <h2
              id="book-order-heading"
              className="mt-3 text-center text-[24px] font-display font-normal leading-tight tracking-tight text-foreground sm:text-[28px]"
            >
              {TA_FOR_ER_ORDER.bookTitle}
            </h2>
            <p className="mt-1.5 text-center text-[14px] text-muted-foreground">
              av {TA_FOR_ER_ORDER.authorName}
            </p>
            <p className="mt-4 text-center text-[15px] font-semibold text-foreground">
              {isEbook ? TA_FOR_ER_EBOOK.priceLabel : TA_FOR_ER_ORDER.priceLabel}{" "}
              <span className="font-normal text-muted-foreground">
                {isEbook ? "· PDF och EPUB" : "· frakt ingår"}
              </span>
            </p>

            {/* Edition picker. Two real products, so it sits above the form
                rather than inside it: it changes which fields are asked for,
                and a control that rewrites the form under you belongs before
                the form, not in the middle of it. */}
            <div
              role="radiogroup"
              aria-label="Välj format"
              className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card/60 p-1.5"
            >
              {(
                [
                  { id: "print" as const, label: "Tryckt bok", price: TA_FOR_ER_ORDER.priceLabel, hint: "Frakt ingår" },
                  { id: "ebook" as const, label: "E-bok", price: TA_FOR_ER_EBOOK.priceLabel, hint: "Direkt nedladdning" },
                ]
              ).map((opt) => {
                const selected = edition === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setEdition(opt.id);
                      clearError();
                    }}
                    className={`min-h-[52px] rounded-xl px-3 py-2 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                      selected
                        ? "bg-foreground text-background shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    }`}
                  >
                    <span className="block text-[14px] font-semibold leading-tight">{opt.label}</span>
                    <span className={`block text-[12px] leading-tight ${selected ? "text-background/70" : "text-muted-foreground"}`}>
                      {opt.price} · {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="wl-order-form mt-6 space-y-4" noValidate>
            <h3 className="wl-order-wide text-left text-[18px] font-semibold tracking-tight text-foreground">
              {isEbook ? "Dina uppgifter" : "Leveransuppgifter"}
            </h3>
            {!isEbook && (
            <div>
              <label htmlFor="order-name" className={labelClass}>
                Namn
              </label>
              <input
                id="order-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearError();
                }}
                placeholder="För- och efternamn"
                className={inputClass}
              />
            </div>
            )}

            <div>
              <label htmlFor="order-email" className={labelClass}>
                E-post
              </label>
              <input
                id="order-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                placeholder="din@epost.se"
                className={inputClass}
              />
            </div>

            {!isEbook && (
              <>
            <div className="wl-order-wide">
              <label htmlFor="order-line1" className={labelClass}>
                Adress
              </label>
              <input
                id="order-line1"
                type="text"
                autoComplete="address-line1"
                value={line1}
                onChange={(e) => {
                  setLine1(e.target.value);
                  clearError();
                }}
                placeholder="Gatuadress"
                className={inputClass}
              />
            </div>

            <div className="wl-order-wide">
              <label htmlFor="order-line2" className={labelClass}>
                Adressrad 2 <span className="text-muted-foreground">(valfritt)</span>
              </label>
              <input
                id="order-line2"
                type="text"
                autoComplete="address-line2"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder="Lägenhet, c/o, etc."
                className={inputClass}
              />
            </div>

            <div className="wl-order-wide flex flex-col gap-4 sm:flex-row">
              <div className="sm:w-2/5">
                <label htmlFor="order-postal" className={labelClass}>
                  Postnummer
                </label>
                <input
                  id="order-postal"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={postalCode}
                  onChange={(e) => {
                    setPostalCode(e.target.value);
                    clearError();
                  }}
                  placeholder="123 45"
                  className={inputClass}
                />
              </div>
              <div className="sm:flex-1">
                <label htmlFor="order-city" className={labelClass}>
                  Ort
                </label>
                <input
                  id="order-city"
                  type="text"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    clearError();
                  }}
                  placeholder="Stockholm"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="wl-order-wide">
              <label htmlFor="order-phone" className={labelClass}>
                Telefon <span className="text-muted-foreground">(valfritt)</span>
              </label>
              <input
                id="order-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="070-123 45 67"
                className={inputClass}
              />
            </div>
              </>
            )}

            {isEbook && (
              <p className="wl-order-wide text-left text-[13px] leading-relaxed text-muted-foreground">
                Boken laddas ner direkt efter betalning. Kvitto skickas till din e-post.
              </p>
            )}

            {errorMessage && (
              <p className="wl-order-wide text-left text-[13px] text-red-700 dark:text-red-300" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "loading"}
              aria-busy={state === "loading"}
              className="wl-order-wide waitlist-cta min-h-[52px] w-full rounded-2xl bg-foreground px-6 py-3 text-[15px] font-medium text-background transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50"
            >
              {state === "loading"
                ? "Tar dig till betalning…"
                : `Fortsätt till betalning · ${isEbook ? TA_FOR_ER_EBOOK.priceLabel : TA_FOR_ER_ORDER.priceLabel}`}
            </button>

            <p className="wl-order-wide text-center text-[12px] leading-relaxed text-muted-foreground">
              {isEbook
                ? "Säker betalning via Stripe. Du väljer PDF eller EPUB efter köpet."
                : "Säker betalning via Stripe. Frakt inom Sverige ingår."}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
