import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply for round one",
  description:
    "Six questions about your book — the application for the first Verkli beta.",
  // The page is reached from a personal invitation, not from search.
  robots: { index: false, follow: false },
};

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
