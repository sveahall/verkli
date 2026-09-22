import { beforeEach, describe, expect, it } from "vitest";
import { OwnedOfflineStore, emptyOfflineState, type OfflineState, type OfflineStorage } from "./owned-store";
import { hashOfflineText, OFFLINE_FIXTURE_AUDIENCE } from "./lease";
import { issueOfflineLease } from "./lease-server";

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const text = "A synthetic chapter, never user text.";
let now: number;
let state: OfflineState;
let store: OwnedOfflineStore;
let storage: OfflineStorage;
async function book(userId = "reader-a", expiresAt = now + 60_000) {
  return { lease: await issueOfflineLease(keys.privateKey, {
    userId, bookId: "book", editionId: "edition-1", chapters: [{ id: "chapter", hash: await hashOfflineText(text) }],
  }, now, expiresAt), chapters: [{ id: "chapter", text }] };
}

beforeEach(() => {
  now = 1_800_000_000_000;
  state = emptyOfflineState();
  storage = { atomic: async (fn) => fn(state) };
  store = new OwnedOfflineStore(storage, keys.publicKey, () => now);
});

describe("owned offline text store", () => {
  it("saves explicit complete text and reads it after reopening the store", async () => {
    const owner = await store.activateOwner("reader-a");
    await store.save(owner, await book());
    const reopened = new OwnedOfflineStore(storage, keys.publicKey, () => now);
    expect(await reopened.read(owner, "book", "edition-1")).toEqual([{ id: "chapter", text }]);
    expect(await reopened.read(owner, "book", "other-edition")).toBeNull();
  });
  it("clears on logout and rejects writes captured before logout or account switch", async () => {
    const owner = await store.activateOwner("reader-a");
    const downloaded = await book();
    await store.save(owner, downloaded);
    await store.activateOwner(null);
    await expect(store.read(owner, "book", "edition-1")).rejects.toThrow("account");
    await expect(store.save(owner, downloaded)).rejects.toThrow("account");
    const other = await store.activateOwner("reader-b");
    expect(await store.read(other, "book", "edition-1")).toBeNull();
    await expect(store.save(other, downloaded)).rejects.toThrow("account");
  });
  it("prevents delayed async verification from writing into a new session of the same user", async () => {
    const owner = await store.activateOwner("reader-a");
    const downloaded = await book();
    const pending = store.save(owner, downloaded);
    await store.activateOwner(null);
    await store.activateOwner("reader-a");
    await expect(pending).rejects.toThrow("account");
  });
  it("rejects an in-flight read after logout and rechecks stored text integrity", async () => {
    const a = await store.activateOwner("reader-a");
    await store.save(a, await book());
    const pending = store.read(a, "book", "edition-1");
    await store.activateOwner(null);
    await expect(pending).rejects.toThrow("account");
    const next = await store.activateOwner("reader-a");
    await store.save(next, await book());
    Object.values(state.books)[0].chapters[0].text = "changed on disk";
    await expect(store.read(next, "book", "edition-1")).rejects.toThrow("match");
  });
  it("uses shared atomic ownership across two tabs and ignores stale revocation responses", async () => {
    const tab2 = new OwnedOfflineStore(storage, keys.publicKey, () => now);
    const a = await store.activateOwner("reader-a");
    await store.save(a, await book());
    const b = await tab2.activateOwner("reader-b");
    await tab2.save(b, await book("reader-b"));
    await store.revoke(a);
    await expect(store.read(a, "book", "edition-1")).rejects.toThrow("account");
    expect(await tab2.read(b, "book", "edition-1")).not.toBeNull();
  });
  it("closes expired text and denies a revoked online right", async () => {
    const a = await store.activateOwner("reader-a");
    await store.save(a, await book());
    now += 60_000;
    await expect(store.read(a, "book", "edition-1")).rejects.toThrow("expired");
    await store.revoke(a);
    await expect(store.read(a, "book", "edition-1")).rejects.toThrow("account");
  });
  it("rejects incomplete, altered, extra and fixture-signed content", async () => {
    const a = await store.activateOwner("reader-a");
    const downloaded = await book();
    await expect(store.save(a, { ...downloaded, chapters: [] })).rejects.toThrow("complete");
    await expect(store.save(a, { ...downloaded, chapters: [{ id: "chapter", text: "altered" }] })).rejects.toThrow("match");
    await expect(store.save(a, { ...downloaded, chapters: [...downloaded.chapters, { id: "extra", text }] })).rejects.toThrow("complete");
    const fixture = await issueOfflineLease(keys.privateKey, { userId: "reader-a", bookId: "book", editionId: "edition-1", chapters: [{ id: "chapter", hash: await hashOfflineText(text) }] }, now, now + 60_000, OFFLINE_FIXTURE_AUDIENCE);
    await expect(store.save(a, { ...downloaded, lease: fixture })).rejects.toThrow("application");
    expect(await store.read(a, "book", "edition-1")).toBeNull();
  });
  it("blocks and clears text when the observed clock moves backwards", async () => {
    const a = await store.activateOwner("reader-a");
    await store.save(a, await book());
    now += 1_000;
    await store.read(a, "book", "edition-1");
    now -= 500;
    await expect(store.read(a, "book", "edition-1")).rejects.toThrow("clock");
    expect(Object.keys(state.books)).toHaveLength(0);
  });
  it("propagates storage/quota errors instead of claiming a completed save", async () => {
    const a = await store.activateOwner("reader-a");
    const failing = new OwnedOfflineStore({ atomic: async () => { throw new Error("Storage quota exceeded"); } }, keys.publicKey, () => now);
    await expect(failing.save(a, await book())).rejects.toThrow("quota");
  });
});
