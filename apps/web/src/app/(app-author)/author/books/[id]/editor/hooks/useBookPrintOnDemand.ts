"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizePrintOnDemandSettings, type PrintOnDemandSettings } from "../panels/PrintPanel.helpers";
import type { Book } from "../BookEditorView.types";

export interface UseBookPrintOnDemandOptions {
  book: Book;
}

export function useBookPrintOnDemand({ book }: UseBookPrintOnDemandOptions) {
  const toast = useToastHelpers();

  const [printOnDemandSettings, setPrintOnDemandSettings] = useState<PrintOnDemandSettings>(() =>
    normalizePrintOnDemandSettings(book.print_on_demand_settings)
  );

  // Render-time sync: update state when book prop changes (e.g. after router.refresh).
  // Uses the prev-prop pattern to avoid setState-in-effect.
  const [prevPodProp, setPrevPodProp] = useState(book.print_on_demand_settings);
  if (prevPodProp !== book.print_on_demand_settings) {
    setPrevPodProp(book.print_on_demand_settings);
    setPrintOnDemandSettings(normalizePrintOnDemandSettings(book.print_on_demand_settings));
  }

  const handleSavePrintOnDemandSettings = useCallback(
    async (nextSettings: PrintOnDemandSettings) => {
      const normalizedSettings = normalizePrintOnDemandSettings(nextSettings);
      const previousSettings = printOnDemandSettings;
      setPrintOnDemandSettings(normalizedSettings);

      const supabase = createClient();
      const { error } = await supabase
        .from("books" as never)
        .update({ print_on_demand_settings: normalizedSettings } as never)
        .eq("id", book.id);

      if (error) {
        setPrintOnDemandSettings(previousSettings);
        const message = "Could not save print on demand settings. Try again.";
        toast.error(message);
        return { ok: false as const, message };
      }

      return { ok: true as const };
    },
    [book.id, printOnDemandSettings, toast]
  );

  return {
    printOnDemandSettings,
    handleSavePrintOnDemandSettings,
  };
}
