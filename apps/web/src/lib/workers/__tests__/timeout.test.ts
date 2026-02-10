import { describe, it, expect } from "vitest";
import { withTimeout, TimeoutError } from "../timeout";

describe("withTimeout", () => {
  it("resolves if fn completes before deadline", async () => {
    const result = await withTimeout(() => Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it("rejects with TimeoutError if fn exceeds deadline", async () => {
    const slow = () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 500));
    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(TimeoutError);
    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow("slow-op timed out after 50ms");
  });

  it("propagates the original error if fn rejects before timeout", async () => {
    const failing = () => Promise.reject(new Error("boom"));
    await expect(withTimeout(failing, 5000)).rejects.toThrow("boom");
  });

  it("skips timeout when ms <= 0", async () => {
    const result = await withTimeout(() => Promise.resolve("ok"), 0);
    expect(result).toBe("ok");
  });

  it("uses default label in error message", async () => {
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slow, 10)).rejects.toThrow("Operation timed out after 10ms");
  });
});
