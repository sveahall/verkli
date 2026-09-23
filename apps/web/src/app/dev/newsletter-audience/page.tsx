import { notFound } from "next/navigation";
import NewsletterAudiencePreview from "./NewsletterAudiencePreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <NewsletterAudiencePreview />;
}
