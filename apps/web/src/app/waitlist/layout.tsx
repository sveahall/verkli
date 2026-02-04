import type { Metadata } from "next";

export const metadata: Metadata = {
<<<<<<< HEAD
  title: "Join the waitlist | Verkli",
  description: "Built for authors who want momentum. Join the Verkli waitlist for early access.",
=======
  title: "verkli",
  description: "authors who publish. Readers who follow.",
>>>>>>> main
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
