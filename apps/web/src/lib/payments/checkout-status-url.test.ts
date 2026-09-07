import { describe, expect, it } from "vitest";
import * as urls from "./checkout-status-url";

describe("purchase status navigation", () => {
  it("builds and accepts only the same book route with two bounded identifiers", () => {
    const value = "/reader/books/book-1/purchase/success?order_id=order-1&session_id=cs_1";
    expect(urls.getPurchaseStatusUrl("book-1", "order-1", "cs_1")).toBe(value);
    expect(urls.validatePurchaseStatusUrl("book-1", value)).toBe(value);
  });
  it.each([
    "https://evil.invalid/reader/books/book-1/purchase/success?order_id=o&session_id=s",
    "//evil.invalid/reader/books/book-1/purchase/success?order_id=o&session_id=s",
    "/reader/books/book-2/purchase/success?order_id=o&session_id=s",
    "/reader/books/book-1/purchase/success?order_id=o", "/reader/books/book-1/purchase/success?order_id=o&session_id=",
    "/reader/books/book-1/purchase/success?order_id=o&session_id=s&session_id=other",
    "/reader/books/book-1/purchase/success?order_id=o&session_id=s&next=https://evil.invalid",
    "/reader/books/book-1/purchase/success?order_id=o&session_id=s#evil",
    "/reader/books/book-1/purchase/success?order_id=%20&session_id=s",
    "/reader/books/book-1/purchase/success?order_id=o&session_id=" + "s".repeat(201),
    "javascript:alert(1)", null, {}, 1,
  ])("rejects unsafe or ambiguous status navigation %j", (value) => {
    expect(urls.validatePurchaseStatusUrl("book-1", value)).toBeNull();
  });
});
