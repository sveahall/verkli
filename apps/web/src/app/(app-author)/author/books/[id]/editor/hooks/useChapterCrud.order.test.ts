import { describe, expect, it } from "vitest";
import { rewriteChapterOrders } from "./useChapterCrud.order";

describe("rewriteChapterOrders", () => {
  it("writes sentinels before the final order", async () => {
    const writes: Array<[string, number]> = [];
    const ok = await rewriteChapterOrders(
      [
        { id: "a", order: 2 },
        { id: "b", order: 0 },
      ],
      async (id, order) => {
        writes.push([id, order]);
        return true;
      },
    );

    expect(ok).toBe(true);
    expect(writes).toEqual([
      ["a", -1],
      ["b", -2],
      ["a", 2],
      ["b", 0],
    ]);
  });

  it("stops on the first failed write", async () => {
    const writes: string[] = [];
    const ok = await rewriteChapterOrders(
      [
        { id: "a", order: 1 },
        { id: "b", order: 0 },
      ],
      async (id) => {
        writes.push(id);
        return id !== "b";
      },
    );

    expect(ok).toBe(false);
    expect(writes).toEqual(["a", "b"]);
  });
});