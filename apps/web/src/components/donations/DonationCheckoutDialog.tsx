"use client";

import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDonationCheckout } from "@/hooks/useDonationCheckout";
import { useToastHelpers } from "@/components/ui/toast";

const PRESETS_SEK = [50, 100, 250, 500];

type DonationCheckoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DonationCheckoutDialog({ open, onOpenChange }: DonationCheckoutDialogProps) {
  const toast = useToastHelpers();
  const { startCheckout, loading } = useDonationCheckout();
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const amountMinor =
    selectedAmount !== null
      ? selectedAmount
      : (() => {
          const n = parseInt(customAmount.replace(/\s/g, ""), 10);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })();

  const handleSubmit = async () => {
    if (amountMinor <= 0) {
      toast.error("Ange ett belopp.");
      return;
    }
    const result = await startCheckout(amountMinor, "sek");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.redirect) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Donera till Verkli</DialogTitle>
        <DialogDescription>
          Välj belopp nedan. Du omdirigeras till säker betalning.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS_SEK.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant={selectedAmount === amount ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                setSelectedAmount(amount);
                setCustomAmount("");
              }}
            >
              {amount} kr
            </Button>
          ))}
        </div>
        <Input
          label="Eget belopp (kr)"
          type="number"
          min={1}
          placeholder="T.ex. 200"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelectedAmount(null);
          }}
          fullWidth
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Avbryt
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={loading}
          loadingText="Öppnar betalning..."
          disabled={amountMinor <= 0 || loading}
        >
          Fortsätt till betalning
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
