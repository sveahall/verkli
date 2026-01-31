import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "verkli",
  description: "authors who publish. Readers who follow.",
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
