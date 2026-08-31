import { getAvailableIntervals } from "@/lib/billing/catalog";
import PricingPageContent from "./PricingPageContent";

// Cached, but not forever: the annual row is added by a migration, and the
// marketing page should start offering annual on its own once it lands rather
// than waiting for the next deploy.
export const revalidate = 300;

/**
 * Asks the catalog what can actually be bought before advertising it. The
 * in-app billing page does the same (see author/billing/page.tsx); a marketing
 * page that promises annual while checkout can only sell monthly is the gap
 * this mirrors shut.
 */
async function annualIsOffered(): Promise<boolean> {
  try {
    return (await getAvailableIntervals("author", "pro")).includes("year");
  } catch {
    // A catalog read can fail at build time, where no service-role key is
    // configured. Fail towards the honest page: monthly only.
    return false;
  }
}

export default async function PricingPage() {
  return <PricingPageContent annualAvailable={await annualIsOffered()} />;
}
