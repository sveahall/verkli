"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useReferrals } from "@/hooks/useReferrals";
import { useToastHelpers } from "@/components/ui/toast";

export function ReferralRedeemForm() {
  const toast = useToastHelpers();
  const { redeemCode, redeemLoading } = useReferrals();
  const [code, setCode] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = code.trim();
      if (!trimmed) {
        toast.error("Ange en referenskod.");
        return;
      }
      const result = await redeemCode(trimmed);
      if (result.ok) {
        toast.success(
          result.creditsAdded > 0
            ? `${result.creditsAdded} krediter tillagda. Tack!`
            : "Kod löst in."
        );
        setCode("");
      } else {
        toast.error(result.error ?? "Kunde inte lösa in koden.");
      }
    },
    [code, redeemCode, toast]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Lösa in referenskod
        </h3>
        <p className="text-xs text-slate-500 dark:text-white/50">
          Har du fått en kod? Ange den här så läggs krediter till ditt konto.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Referenskod"
            placeholder="T.ex. ABC12XYZ"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            fullWidth
            className="sm:flex-1"
            disabled={redeemLoading}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="primary"
            isLoading={redeemLoading}
            loadingText="Löser in..."
            disabled={!code.trim() || redeemLoading}
            className="sm:w-auto"
          >
            Lösa in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
