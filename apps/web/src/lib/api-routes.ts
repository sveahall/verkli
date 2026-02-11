export const API_ROUTES = {
  donationsCheckout: "/api/donations/checkout",
  creditsBalance: "/api/credits/balance",
  creditsCheckout: "/api/credits/checkout",
  referralsGenerate: "/api/referrals/generate",
  referralsRedeem: "/api/referrals/redeem",
  stripeWebhook: "/api/stripe/webhook",
  bookPurchaseCheckout: (bookId: string) => `/api/books/${encodeURIComponent(bookId)}/purchase/checkout`,
} as const;
