"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DonationCheckoutDialog } from "./DonationCheckoutDialog";

type DonationButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  children?: React.ReactNode;
  className?: string;
};

export function DonationButton({
  variant = "secondary",
  size = "md",
  children = "Donera",
  className,
}: DonationButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <DonationCheckoutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
