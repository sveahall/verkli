import { describe, it, expect, beforeEach } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../circuit-breaker";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ threshold: 3, resetTimeoutMs: 100, name: "test" });
  });

  it("starts in closed state", () => {
    expect(cb.getState()).toBe("closed");
  });

  it("passes through successful calls", async () => {
    const result = await cb.exec(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe("closed");
  });

  it("opens after threshold consecutive failures", async () => {
    const fail = () => Promise.reject(new Error("fail"));

    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("open");
  });

  it("rejects calls when open", async () => {
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("fail");
    }

    await expect(cb.exec(() => Promise.resolve(1))).rejects.toThrow(CircuitOpenError);
  });

  it("transitions to half_open after resetTimeout", async () => {
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("open");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    expect(cb.getState()).toBe("half_open");
  });

  it("closes after successful probe in half_open", async () => {
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("fail");
    }

    await new Promise((r) => setTimeout(r, 150));

    const result = await cb.exec(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens after failed probe in half_open", async () => {
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("fail");
    }

    await new Promise((r) => setTimeout(r, 150));

    // Probe fails
    await expect(cb.exec(fail)).rejects.toThrow("fail");
    // After 3 initial + 1 probe = 4 failures >= threshold, should be open
    expect(cb.getState()).toBe("open");
  });

  it("resets failure count on success", async () => {
    const fail = () => Promise.reject(new Error("fail"));

    // Fail twice (below threshold)
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();

    // Succeed — resets counter
    await cb.exec(() => Promise.resolve("ok"));

    // Fail twice more — still below threshold
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();

    expect(cb.getState()).toBe("closed");
  });

  it("reset() restores to closed", async () => {
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
  });
});
