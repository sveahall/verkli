"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useReferrals } from "@/hooks/useReferrals";
import { useToastHelpers } from "@/components/ui/toast";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a1.5 1.5 0 00-.44-1.06L8.44 5.439A1.5 1.5 0 007.379 5H7V3.5z" />
      <path d="M4.5 4A1.5 1.5 0 003 5.5v9A1.5 1.5 0 004.5 16h7a1.5 1.5 0 001.5-1.5v-1.5h-2v1.5H4.5v-9h2V5.5A1.5 1.5 0 004.5 4z" />
    </svg>
  );
}

export function ReferralCodeGenerator() {
  const toast = useToastHelpers();
  const { generateCode, generateLoading } = useReferrals();
  const [code, setCode] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    const result = await generateCode();
    if (result.ok && result.code) {
      setCode(result.code);
      toast.success("Referenskod skapad.");
    } else {
      toast.error(result.error ?? "Kunde inte skapa kod.");
    }
  }, [generateCode, toast]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => {
      toast.success("Koden kopierad till urklipp.");
    });
  }, [code, toast]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Din referenskod
        </h3>
        <p className="text-xs text-slate-500 dark:text-white/50">
          Dela koden så får både du och den du bjuder in krediter när de löst in den.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {code ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono dark:border-white/10 dark:bg-white/5 dark:text-white">
              {code}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={handleCopy}
              aria-label="Kopiera kod"
            >
              <CopyIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={handleGenerate}
            isLoading={generateLoading}
            loadingText="Skapar..."
          >
            Skapa referenskod
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
