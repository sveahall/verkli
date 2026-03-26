import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Mock global fetch ──────────────────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ── Helpers ────────────────────────────────────────────────────────

function stripeOk(body: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function stripeError(status: number, message = "Something went wrong") {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

function lastFetchBody(): URLSearchParams {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return new URLSearchParams(init.body as string);
}

// ── Import after mocks ─────────────────────────────────────────────
import {
  createStripeCheckoutSession,
  getStripeCheckoutSession,
  createDonationCheckoutSession,
  createAudiobookCheckoutSession,
  createTranslationCheckoutSession,
  createPodCheckoutSession,
  createCreditTopUpCheckoutSession,
  isStripeConfigured,
} from "./stripe";

// ────────────────────────────────────────────────────────────────────
describe("lib/payments/stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  // ── isStripeConfigured ───────────────────────────────────────────
  describe("isStripeConfigured", () => {
    it("returns true when STRIPE_SECRET_KEY is set", () => {
      expect(isStripeConfigured()).toBe(true);
    });

    it("returns false when key is missing", () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect(isStripeConfigured()).toBe(false);
    });

    it("returns false when key is whitespace", () => {
      process.env.STRIPE_SECRET_KEY = "   ";
      expect(isStripeConfigured()).toBe(false);
    });
  });

  // ── createStripeCheckoutSession ──────────────────────────────────
  describe("createStripeCheckoutSession", () => {
    const validInput = {
      amount: 4900,
      currency: "SEK",
      bookTitle: "Min bok",
      customerEmail: "test@example.com",
      successUrl: "https://verkli.se/success",
      cancelUrl: "https://verkli.se/cancel",
      metadata: {
        orderId: "order-1",
        userId: "user-1",
        bookId: "book-1",
      },
    };

    it("creates a session and returns id + url", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" })
      );

      const session = await createStripeCheckoutSession(validInput);

      expect(session.id).toBe("cs_123");
      expect(session.url).toBe("https://checkout.stripe.com/cs_123");
    });

    it("sends correct parameters to Stripe API", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" })
      );

      await createStripeCheckoutSession(validInput);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer sk_test_123");

      const body = lastFetchBody();
      expect(body.get("mode")).toBe("payment");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("4900");
      expect(body.get("line_items[0][price_data][currency]")).toBe("sek");
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe("Min bok");
      expect(body.get("customer_email")).toBe("test@example.com");
      expect(body.get("metadata[user_id]")).toBe("user-1");
      expect(body.get("metadata[book_id]")).toBe("book-1");
      expect(body.get("metadata[order_id]")).toBe("order-1");
    });

    it("throws when amount is zero", async () => {
      await expect(
        createStripeCheckoutSession({ ...validInput, amount: 0 })
      ).rejects.toThrow("Amount must be greater than zero");
    });

    it("throws when amount is negative", async () => {
      await expect(
        createStripeCheckoutSession({ ...validInput, amount: -100 })
      ).rejects.toThrow("Amount must be greater than zero");
    });

    it("truncates non-integer amounts", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" })
      );

      await createStripeCheckoutSession({ ...validInput, amount: 49.99 });

      const body = lastFetchBody();
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("49");
    });

    it("throws when Stripe returns an error", async () => {
      fetchMock.mockResolvedValueOnce(stripeError(400, "Invalid currency"));

      await expect(
        createStripeCheckoutSession(validInput)
      ).rejects.toThrow("Invalid currency");
    });

    it("throws when response has no id", async () => {
      fetchMock.mockResolvedValueOnce(stripeOk({ url: "https://x.com" }));

      await expect(
        createStripeCheckoutSession(validInput)
      ).rejects.toThrow("Missing Stripe session id");
    });

    it("throws when response has no url", async () => {
      fetchMock.mockResolvedValueOnce(stripeOk({ id: "cs_123" }));

      await expect(
        createStripeCheckoutSession(validInput)
      ).rejects.toThrow("Stripe session URL is missing");
    });

    it("throws when STRIPE_SECRET_KEY is missing", async () => {
      delete process.env.STRIPE_SECRET_KEY;

      await expect(
        createStripeCheckoutSession(validInput)
      ).rejects.toThrow("Missing STRIPE_SECRET_KEY");
    });

    it("omits customer_email when not provided", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" })
      );

      await createStripeCheckoutSession({ ...validInput, customerEmail: null });

      const body = lastFetchBody();
      expect(body.has("customer_email")).toBe(false);
    });
  });

  // ── getStripeCheckoutSession ─────────────────────────────────────
  describe("getStripeCheckoutSession", () => {
    it("fetches a session by id", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_existing", url: "https://checkout.stripe.com/cs_existing", status: "open" })
      );

      const session = await getStripeCheckoutSession("cs_existing");

      expect(session.id).toBe("cs_existing");
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_existing");
    });

    it("encodes special characters in session id", async () => {
      fetchMock.mockResolvedValueOnce(stripeOk({ id: "cs_a/b" }));

      await getStripeCheckoutSession("cs_a/b");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain("cs_a%2Fb");
    });
  });

  // ── createDonationCheckoutSession ────────────────────────────────
  describe("createDonationCheckoutSession", () => {
    const validDonation = {
      amountMinor: 5000,
      currency: "SEK",
      userId: "user-1",
      donationId: "don-1",
      creditsDelta: 10,
      customerEmail: "donor@example.com",
      successUrl: "https://verkli.se/donation/success",
      cancelUrl: "https://verkli.se/donation/cancel",
    };

    it("creates a donation session with correct metadata", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_don", url: "https://checkout.stripe.com/cs_don" })
      );

      const session = await createDonationCheckoutSession(validDonation);

      expect(session.id).toBe("cs_don");

      const body = lastFetchBody();
      expect(body.get("metadata[payment_kind]")).toBe("donation");
      expect(body.get("metadata[donation_id]")).toBe("don-1");
      expect(body.get("metadata[credits_delta]")).toBe("10");
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe("Donation till Verkli");
    });

    it("omits credits_delta when zero", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_don", url: "https://checkout.stripe.com/cs_don" })
      );

      await createDonationCheckoutSession({ ...validDonation, creditsDelta: 0 });

      const body = lastFetchBody();
      expect(body.has("metadata[credits_delta]")).toBe(false);
    });

    it("throws when amount is zero", async () => {
      await expect(
        createDonationCheckoutSession({ ...validDonation, amountMinor: 0 })
      ).rejects.toThrow("Amount must be greater than zero");
    });
  });

  // ── createAudiobookCheckoutSession ───────────────────────────────
  describe("createAudiobookCheckoutSession", () => {
    it("sets audiobook metadata", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_ab", url: "https://checkout.stripe.com/cs_ab" })
      );

      await createAudiobookCheckoutSession({
        amountMinor: 9900,
        currency: "EUR",
        userId: "user-1",
        bookId: "book-1",
        language: "sv",
        successUrl: "https://verkli.se/success",
        cancelUrl: "https://verkli.se/cancel",
      });

      const body = lastFetchBody();
      expect(body.get("metadata[payment_kind]")).toBe("audiobook");
      expect(body.get("metadata[book_id]")).toBe("book-1");
      expect(body.get("metadata[language]")).toBe("sv");
      expect(body.get("line_items[0][price_data][currency]")).toBe("eur");
    });
  });

  // ── createTranslationCheckoutSession ─────────────────────────────
  describe("createTranslationCheckoutSession", () => {
    it("sets translation metadata with language count in product name", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_tr", url: "https://checkout.stripe.com/cs_tr" })
      );

      await createTranslationCheckoutSession({
        amountMinor: 15000,
        currency: "USD",
        userId: "user-1",
        bookId: "book-1",
        languages: "en,sv,de",
        sourceVersionId: "v-1",
        sourceLanguage: "sv",
        successUrl: "https://verkli.se/success",
        cancelUrl: "https://verkli.se/cancel",
      });

      const body = lastFetchBody();
      expect(body.get("metadata[payment_kind]")).toBe("translation");
      expect(body.get("metadata[languages]")).toBe("en,sv,de");
      expect(body.get("metadata[source_version_id]")).toBe("v-1");
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe(
        "Book translation (3 languages)"
      );
    });

    it("uses singular label for 1 language", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_tr", url: "https://checkout.stripe.com/cs_tr" })
      );

      await createTranslationCheckoutSession({
        amountMinor: 5000,
        currency: "SEK",
        userId: "user-1",
        bookId: "book-1",
        languages: "en",
        sourceVersionId: "v-1",
        sourceLanguage: "sv",
        successUrl: "https://verkli.se/success",
        cancelUrl: "https://verkli.se/cancel",
      });

      const body = lastFetchBody();
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe(
        "Book translation (1 language)"
      );
    });
  });

  // ── createPodCheckoutSession ─────────────────────────────────────
  describe("createPodCheckoutSession", () => {
    it("includes shipping countries and format metadata", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_pod", url: "https://checkout.stripe.com/cs_pod" })
      );

      await createPodCheckoutSession({
        amountMinor: 29900,
        currency: "SEK",
        userId: "user-1",
        bookId: "book-1",
        podOrderId: "pod-1",
        format: "hardcover",
        bookTitle: "Min bok",
        successUrl: "https://verkli.se/success",
        cancelUrl: "https://verkli.se/cancel",
      });

      const body = lastFetchBody();
      expect(body.get("metadata[payment_kind]")).toBe("pod");
      expect(body.get("metadata[pod_order_id]")).toBe("pod-1");
      expect(body.get("metadata[format]")).toBe("hardcover");
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe(
        "Min bok (hardcover print copy)"
      );
      // Verify shipping countries include SE
      expect(body.get("shipping_address_collection[allowed_countries][0]")).toBe("SE");
    });
  });

  // ── createCreditTopUpCheckoutSession ─────────────────────────────
  describe("createCreditTopUpCheckoutSession", () => {
    it("creates credit top-up session with credit_delta", async () => {
      fetchMock.mockResolvedValueOnce(
        stripeOk({ id: "cs_credit", url: "https://checkout.stripe.com/cs_credit" })
      );

      await createCreditTopUpCheckoutSession({
        amountMinor: 9900,
        creditsDelta: 100,
        currency: "SEK",
        userId: "user-1",
        creditTopupId: "topup-1",
        successUrl: "https://verkli.se/success",
        cancelUrl: "https://verkli.se/cancel",
      });

      const body = lastFetchBody();
      expect(body.get("metadata[payment_kind]")).toBe("credit_topup");
      expect(body.get("metadata[credit_topup_id]")).toBe("topup-1");
      expect(body.get("metadata[credit_delta]")).toBe("100");
      expect(body.get("line_items[0][price_data][product_data][name]")).toBe("Verkli credits");
    });

    it("throws when creditsDelta is zero", async () => {
      await expect(
        createCreditTopUpCheckoutSession({
          amountMinor: 9900,
          creditsDelta: 0,
          currency: "SEK",
          userId: "user-1",
          creditTopupId: "topup-1",
          successUrl: "https://verkli.se/success",
          cancelUrl: "https://verkli.se/cancel",
        })
      ).rejects.toThrow("creditsDelta must be greater than zero");
    });

    it("throws when amount is zero", async () => {
      await expect(
        createCreditTopUpCheckoutSession({
          amountMinor: 0,
          creditsDelta: 100,
          currency: "SEK",
          userId: "user-1",
          creditTopupId: "topup-1",
          successUrl: "https://verkli.se/success",
          cancelUrl: "https://verkli.se/cancel",
        })
      ).rejects.toThrow("Amount must be greater than zero");
    });
  });
});
