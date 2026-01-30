import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the waitlist | Verkli",
  description: "Built for authors who want momentum. Join the Verkli waitlist for early access.",
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
