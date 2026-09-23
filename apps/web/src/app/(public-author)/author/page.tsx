import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For authors",
  description:
    "Publish, translate, and reach readers worldwide with Verkli. The all-in-one platform for independent authors.",
  openGraph: {
    title: "For authors | Verkli",
    description:
      "Publish, translate, and reach readers worldwide with Verkli.",
  },
};

export { default } from "@/features/author/AuthorLandingPage";
