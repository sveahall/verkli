"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import type { Book } from "../BookEditorView.types";

interface UseBookPricingOptions {
  book: Book;
}

export function useBookPricing({ book }: UseBookPricingOptions) {
  const router = useRouter();
  const toast = useToastHelpers();
  const pricingSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialPriceMinor = Math.max(0, Math.trunc(Number(book.price_amount ?? 0)));
  const initialCurrency = ["SEK", "EUR", "USD"].includes(String(book.price_currency ?? "").trim().toUpperCase())
    ? String(book.price_currency).trim().toUpperCase()
    : "SEK";
  const initialPricingModel: "book_only" | "per_chapter" = book.pricing_model === "per_chapter" ? "per_chapter" : "book_only";

  const [priceAmountMinor, setPriceAmountMinor] = useState(initialPriceMinor);
  const [priceCurrency, setPriceCurrency] = useState(initialCurrency);
  const [pricingModel, setPricingModel] = useState<"book_only" | "per_chapter">(initialPricingModel);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSaved, setPricingSaved] = useState(false);

  // Sync state when book prop changes (e.g. after router.refresh)
  const [prevBookPricing, setPrevBookPricing] = useState({
    amount: book.price_amount,
    currency: book.price_currency,
    model: book.pricing_model,
  });
  if (
    prevBookPricing.amount !== book.price_amount ||
    prevBookPricing.currency !== book.price_currency ||
    prevBookPricing.model !== book.pricing_model
  ) {
    setPrevBookPricing({ amount: book.price_amount, currency: book.price_currency, model: book.pricing_model });
    setPriceAmountMinor(initialPriceMinor);
    setPriceCurrency(initialCurrency);
    setPricingModel(initialPricingModel);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pricingSavedTimerRef.current) clearTimeout(pricingSavedTimerRef.current);
    };
  }, []);

  const handleSavePricing = useCallback(async () => {
    setPricingError(null);
    setPricingSaving(true);
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_amount: priceAmountMinor, price_currency: priceCurrency, pricing_model: pricingModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPricingError(resolveErrorMessage(data?.error));
        return;
      }
      setPricingSaved(true);
      toast.success("Pricing saved.");
      if (pricingSavedTimerRef.current) clearTimeout(pricingSavedTimerRef.current);
      pricingSavedTimerRef.current = setTimeout(() => setPricingSaved(false), 3000);
      router.refresh();
    } catch {
      setPricingError(resolveErrorMessage(null));
    } finally {
      setPricingSaving(false);
    }
  }, [book.id, priceAmountMinor, priceCurrency, pricingModel, router, toast]);

  const pricingDirty =
    priceAmountMinor !== initialPriceMinor ||
    priceCurrency !== initialCurrency ||
    pricingModel !== initialPricingModel;

  return {
    priceAmountMinor,
    setPriceAmountMinor,
    priceCurrency,
    setPriceCurrency,
    pricingModel,
    setPricingModel,
    pricingSaving,
    pricingError,
    pricingSaved,
    pricingDirty,
    handleSavePricing,
  };
}
