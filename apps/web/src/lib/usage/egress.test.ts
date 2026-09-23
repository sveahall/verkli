import { describe, it, expect, vi, beforeEach } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("./meter", () => ({ recordUsage: (...args: unknown[]) => recordUsageMock(...args) }));

const listMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ list: listMock }) } }),
}));

const { recordEgressGrant } = await import("./egress");

describe("recordEgressGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({
      data: [{ name: "ch1.mp3", metadata: { size: 52_428_800 } }],
      error: null,
    });
  });

  it("records the granted bytes and marks them an estimate", async () => {
    await recordEgressGrant({
      userId: "user-1",
      bucket: "audiobooks",
      path: "book-1/ch1.mp3",
      bookId: "book-1",
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", bookId: "book-1" });
    expect(events[0]).toMatchObject({ kind: "egress_grant", quantity: 52_428_800, unit: "bytes" });
    expect(events[0].meta).toMatchObject({ estimated: true, bucket: "audiobooks" });
  });

  it("records nothing when the object has no size rather than logging zero bytes", async () => {
    listMock.mockResolvedValue({ data: [{ name: "ch1.mp3", metadata: null }], error: null });
    await recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "book-1/ch1.mp3" });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records nothing when the object is missing entirely", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    await recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "book-1/gone.mp3" });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("never throws when the size lookup fails, since playback must not depend on metering", async () => {
    listMock.mockRejectedValue(new Error("storage down"));
    await expect(
      recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "book-1/ch1.mp3" })
    ).resolves.toBeUndefined();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("looks the object up by its own name inside its own folder", async () => {
    await recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "book-1/nested/ch1.mp3" });
    expect(listMock).toHaveBeenCalledWith("book-1/nested", { limit: 1, search: "ch1.mp3" });
  });
});
