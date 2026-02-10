import { describe, it, expect } from "vitest";
import { makeJobId, isDuplicate } from "../idempotency";

describe("makeJobId", () => {
  it("produces a deterministic id from prefix and keys", () => {
    const id1 = makeJobId("import", "org-1", "abc123");
    const id2 = makeJobId("import", "org-1", "abc123");
    expect(id1).toBe(id2);
  });

  it("produces different ids for different keys", () => {
    const id1 = makeJobId("import", "org-1", "abc123");
    const id2 = makeJobId("import", "org-2", "abc123");
    expect(id1).not.toBe(id2);
  });

  it("produces different ids for different prefixes", () => {
    const id1 = makeJobId("import", "org-1");
    const id2 = makeJobId("translation", "org-1");
    expect(id1).not.toBe(id2);
  });

  it("includes the prefix in the output", () => {
    const id = makeJobId("import", "key1");
    expect(id).toMatch(/^import:/);
  });

  it("has consistent length", () => {
    const id = makeJobId("import", "some", "keys", "here");
    // prefix:12-char-hash
    expect(id.split(":")[1]).toHaveLength(12);
  });
});

describe("isDuplicate", () => {
  it("returns true when checkFn returns true", async () => {
    const result = await isDuplicate(() => Promise.resolve(true), "test");
    expect(result).toBe(true);
  });

  it("returns false when checkFn returns false", async () => {
    const result = await isDuplicate(() => Promise.resolve(false));
    expect(result).toBe(false);
  });

  it("returns false when checkFn throws (fail-open)", async () => {
    const result = await isDuplicate(() => Promise.reject(new Error("db error")));
    expect(result).toBe(false);
  });
});
