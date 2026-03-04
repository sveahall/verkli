import Link from "next/link";
import PurchaseBookButton from "@/app/(reader-browse)/reader/books/[id]/PurchaseBookButton";

function formatMoney(amount: number, currency: string): string {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

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
    <div className="mt-10 rounded-[24px] border border-[#907AFF]/20 bg-[#907AFF]/5 p-8">
      <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white">
        Want to keep reading?
      </h2>
      <p className="mt-2 text-[14px] text-slate-600 dark:text-white/60">
        You have read the free preview. Unlock all chapters by purchasing the book or upgrading to Verkli Plus.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {isSignedIn ? (
          <PurchaseBookButton
            bookId={bookId}
            amount={priceAmount}
            currency={priceCurrency}
          />
        ) : (
          <Link
            href={signInHref}
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl bg-[#907AFF] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8069EE] hover:shadow"
          >
            Sign in to purchase — {formatMoney(priceAmount, priceCurrency)}
          </Link>
        )}

        <Link
          href="/reader/billing"
          className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl border border-[#907AFF]/30 bg-[#907AFF]/10 px-5 text-sm font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/20 dark:text-[#B8A9FF] dark:hover:bg-[#907AFF]/15"
        >
          Upgrade to Verkli Plus
        </Link>
      </div>
    </div>
  );
}
