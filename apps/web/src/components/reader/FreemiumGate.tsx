import Link from "next/link";
import PurchaseBookButton from "@/app/(reader-browse)/reader/books/[id]/PurchaseBookButton";
import { formatMoney } from "@/lib/format-money";

type FreemiumGateProps = {
  bookId: string;
  priceAmount: number;
  priceCurrency: string;
  isSignedIn: boolean;
  signInHref: string;
};

export default function FreemiumGate({
  bookId,
  priceAmount,
  priceCurrency,
  isSignedIn,
  signInHref,
}: FreemiumGateProps) {
  return (
    <div className="rounded-2xl border border-[#907AFF]/15 bg-[#907AFF]/[0.04] p-6">
      <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">
        Want to keep reading?
      </h2>
      <p className="mt-2 text-sm text-[#64748B] dark:text-white/60">
        You have read the free preview. Unlock all chapters by purchasing the book or upgrading to Verkli Plus.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {isSignedIn ? (
          <PurchaseBookButton
            bookId={bookId}
            amount={priceAmount}
            currency={priceCurrency}
          />
        ) : (
          <Link
            href={signInHref}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#907AFF] px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#7A66E0] active:scale-[0.97]"
          >
            Sign in to purchase — {formatMoney(priceAmount, priceCurrency)}
          </Link>
        )}

        <Link
          href="/reader/billing"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[#907AFF]/25 px-6 text-sm font-semibold text-[#907AFF] transition-colors hover:bg-[#907AFF]/10 dark:text-[#B8A9FF]"
        >
          Upgrade to Verkli Plus
        </Link>
      </div>
    </div>
  );
}
