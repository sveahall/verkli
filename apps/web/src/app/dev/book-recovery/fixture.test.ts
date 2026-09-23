import { describe, expect, it } from "vitest";
import { createRecoveryFixture } from "./fixture";

describe("synthetic recovery contract", () => {
  it("restores a book privately without replacing its manuscript or restoring separately deleted chapters", async () => {
    const fixture = createRecoveryFixture();
    const before = fixture.snapshot();
    const item = (await fixture.adapter.list())[0];
    await fixture.adapter.restore(item);
    const after = fixture.snapshot();
    expect(after[0]).toMatchObject({ deletedAt: null, published: false, content: before[0].content });
    expect(after[1]).toEqual(before[1]);
    expect(after.slice(1)).toEqual(before.slice(1));
  });
  it("rejects a stale revision without changing any row", async () => {
    const fixture = createRecoveryFixture();
    const item = (await fixture.adapter.list())[0];
    fixture.changeRevision(item.id);
    const before = fixture.snapshot();
    await expect(fixture.adapter.restore(item)).rejects.toThrow("changed");
    expect(fixture.snapshot()).toEqual(before);
  });
  it("does not expose or restore another author's material", async () => {
    const fixture = createRecoveryFixture();
    const item = (await fixture.adapter.list())[0];
    fixture.setOwner("other");
    expect(await fixture.adapter.list()).toEqual([]);
    await expect(fixture.adapter.restore(item)).rejects.toThrow("unavailable");
  });
  it("requires restoring the parent before a chapter", async () => {
    const fixture = createRecoveryFixture();
    const chapter = (await fixture.adapter.list()).find((item) => item.id === "chapter")!;
    await expect(fixture.adapter.restore(chapter)).rejects.toThrow("book first");
  });
  it("rejects an occupied chapter position instead of overwriting or reordering", async () => {
    const fixture = createRecoveryFixture();
    const item = (await fixture.adapter.list()).find((row) => row.id === "conflict")!;
    const before = fixture.snapshot();
    await expect(fixture.adapter.restore(item)).rejects.toThrow("position");
    expect(fixture.snapshot()).toEqual(before);
  });
  it("restores a chapter after its parent without changing active contents", async () => {
    const fixture = createRecoveryFixture();
    const items = await fixture.adapter.list();
    await fixture.adapter.restore(items[0]);
    await fixture.adapter.restore(items.find((row) => row.id === "chapter")!);
    expect(fixture.snapshot().find((row) => row.id === "chapter")).toMatchObject({ deletedAt: null, content: "The lighthouse keeper opened the door.", published: false });
    await expect(fixture.adapter.restore(items[0])).rejects.toThrow("changed");
  });
});
