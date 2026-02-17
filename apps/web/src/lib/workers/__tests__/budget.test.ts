import { describe, it, expect, beforeEach } from "vitest";
import {
  checkBudget,
  trackUsage,
  getUsage,
  resetAllBudgets,
  BudgetExceededError,
} from "../budget";

describe("budget", () => {
  beforeEach(() => {
    resetAllBudgets();
  });

  it("allows usage under the daily limit", () => {
    expect(() => checkBudget("user-1")).not.toThrow();
  });

  it("tracks usage and reports it", () => {
    trackUsage("user-1", 500);
    const usage = getUsage("user-1");
    expect(usage).toEqual({ daily: 500, monthly: 500 });
  });

  it("throws BudgetExceededError when daily limit is exceeded", () => {
    trackUsage("user-1", 100);
    expect(() => checkBudget("user-1", { dailyTokens: 100, monthlyTokens: 1000 })).toThrow(BudgetExceededError);
    expect(() => checkBudget("user-1", { dailyTokens: 100, monthlyTokens: 1000 })).toThrow(/daily/);
  });

  it("throws BudgetExceededError when monthly limit is exceeded", () => {
    trackUsage("user-1", 1000);
    expect(() => checkBudget("user-1", { dailyTokens: 5000, monthlyTokens: 1000 })).toThrow(BudgetExceededError);
  });

  it("allows usage with custom limits", () => {
    trackUsage("user-1", 50);
    expect(() => checkBudget("user-1", { dailyTokens: 100, monthlyTokens: 1000 })).not.toThrow();
  });

  it("denies usage with custom limits", () => {
    trackUsage("user-1", 101);
    expect(() => checkBudget("user-1", { dailyTokens: 100, monthlyTokens: 1000 })).toThrow(
      BudgetExceededError
    );
  });

  it("returns null for unknown keys", () => {
    expect(getUsage("unknown")).toBeNull();
  });

  it("accumulates multiple trackUsage calls", () => {
    trackUsage("user-1", 100);
    trackUsage("user-1", 200);
    trackUsage("user-1", 300);
    const usage = getUsage("user-1");
    expect(usage).toEqual({ daily: 600, monthly: 600 });
  });

  it("resetAllBudgets clears everything", () => {
    trackUsage("user-1", 1000);
    resetAllBudgets();
    expect(getUsage("user-1")).toBeNull();
    expect(() => checkBudget("user-1")).not.toThrow();
  });
});
