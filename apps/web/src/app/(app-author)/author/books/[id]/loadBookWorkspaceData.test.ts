import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBookWorkspaceData } from "./loadBookWorkspaceData";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getAudiobookStorageBucket: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/tts/storage", () => ({ getAudiobookStorageBucket: mocks.getAudiobookStorageBucket }));
vi.mock("@/lib/payments/stripe", () => ({ isStripeConfigured: () => false }));

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_BOOK_ID = "00000000-0000-4000-8000-000000000002";
const CHAPTER_ID = "00000000-0000-4000-8000-000000000003";
const AUDIO_PATH = `${BOOK_ID}/audiobook-1770000000000.wav`;

function setupData(audioPath: unknown, bucket: unknown, userId: string | null = "user-1", authorId = "user-1") {
  const tables: Record<string, Record<string, unknown>[]> = {
    books: [{ id: BOOK_ID, author_id: authorId, original_language: "en" }],
    book_versions: [{ id: "version-1", book_id: BOOK_ID, language_code: "en", status: "draft", visibility: "private" }],
    audiobook_assets: [{ id: "asset-1", audio_path: audioPath, audio_bucket: bucket, status: "generated", created_at: "2026-09-15" }],
    chapters: [],
    marketing_campaigns: [],
    profiles: [],
  };
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: (table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      let columns = "*";
      const rows = () => tables[table].map((row) => columns === "*" ? row : Object.fromEntries(
        columns.split(",").map((column) => [column.trim(), row[column.trim()]])
      ));
      const chain = {
        select: (value: string) => { columns = value; return chain; },
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
      };
      return chain;
    },
  });
  return tables;
}

describe("author workspace audiobook storage signing", () => {
  const sign = vi.fn();
  const storageFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAudiobookStorageBucket.mockReturnValue("audiobooks");
    sign.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed.invalid/${path}` }, error: null }));
    storageFrom.mockReturnValue({ createSignedUrl: sign });
    mocks.createAdminClient.mockReturnValue({ storage: { from: storageFrom } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads the profile bio and saved cover text for the book editor", async () => {
    const tables = setupData(null, null);
    tables.profiles = [{ display_name: "NN", bio: "  Professor of archaeology.  " }];
    tables.books[0].cover_copy = { authorLine: "Saved line", dustJacket: true, flapText: "Saved flap" };
    const result = await loadBookWorkspaceData(BOOK_ID);
    expect(result?.authorBio).toBe("Professor of archaeology.");
    expect(result?.book.cover_copy).toEqual(tables.books[0].cover_copy);
  });

  it("leaves the cover profile bio empty when no profile exists", async () => {
    setupData(null, null);
    expect((await loadBookWorkspaceData(BOOK_ID))?.authorBio).toBe("");
  });

  it.each([
    AUDIO_PATH,
    AUDIO_PATH.replace(/wav$/, "mp3"),
    `${BOOK_ID}/audiobook-manifest-1770000000000.json`,
    `cache/${BOOK_ID}/${CHAPTER_ID}-0123456789abcdef.wav`,
    `cache/${BOOK_ID}/${CHAPTER_ID}-0123456789abcdef.mp3`,
  ])("signs a valid owned output: %s", async (audioPath) => {
    setupData(` ${audioPath} `, "audiobooks");
    const result = await loadBookWorkspaceData(BOOK_ID);
    expect(result?.latestAudiobookAsset?.audioSignedUrl).toBe(`https://signed.invalid/${audioPath}`);
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith("audiobooks");
    expect(sign).toHaveBeenCalledExactlyOnceWith(audioPath, 900);
  });

  it.each([undefined, null, ""])("accepts legacy bucket metadata: %s", async (bucket) => {
    setupData(AUDIO_PATH, bucket);
    expect((await loadBookWorkspaceData(BOOK_ID))?.latestAudiobookAsset?.audioSignedUrl).toBe(`https://signed.invalid/${AUDIO_PATH}`);
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith("audiobooks");
  });

  it.each([
    ["another book in the same bucket", AUDIO_PATH.replace(BOOK_ID, OTHER_BOOK_ID), "audiobooks"],
    ["book prefix collision", AUDIO_PATH.replace(BOOK_ID, `${BOOK_ID}-extra`), "audiobooks"],
    ["path traversal", `${BOOK_ID}/../${OTHER_BOOK_ID}/audiobook-1.wav`, "audiobooks"],
    ["encoded traversal", `${BOOK_ID}/%2e%2e/${OTHER_BOOK_ID}/audiobook-1.wav`, "audiobooks"],
    ["absolute URL", "https://private.invalid/file?token=private-token", "audiobooks"],
    ["malformed path", { path: "private-token" }, "audiobooks"],
    ["foreign bucket", AUDIO_PATH, "private-book-downloads"],
    ["malformed bucket", AUDIO_PATH, { name: "private-token" }],
  ])("rejects %s before creating a signing client", async (_name, audioPath, bucket) => {
    setupData(audioPath, bucket);
    const result = await loadBookWorkspaceData(BOOK_ID);
    expect(result?.latestAudiobookAsset?.audioSignedUrl).toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).not.toContain(typeof audioPath === "string" ? audioPath : "private-token");
    expect(logs).not.toContain("private-book-downloads");
    expect(logs).not.toContain("private-token");
  });

  it("uses the configured bucket for owned output", async () => {
    mocks.getAudiobookStorageBucket.mockReturnValue("private-audiobooks");
    setupData(AUDIO_PATH, "private-audiobooks");
    expect((await loadBookWorkspaceData(BOOK_ID))?.latestAudiobookAsset?.audioSignedUrl).toBe(`https://signed.invalid/${AUDIO_PATH}`);
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith("private-audiobooks");
  });

  it.each([
    { data: null, error: { message: "Failed https://private.invalid/file?token=private-token" } },
    { data: null, error: null },
  ])("returns an empty preview and safe logs on a signing failure: %j", async (response) => {
    setupData(AUDIO_PATH, "audiobooks");
    sign.mockResolvedValue(response);
    expect((await loadBookWorkspaceData(BOOK_ID))?.latestAudiobookAsset?.audioSignedUrl).toBeNull();
    expect(console.error).toHaveBeenCalled();
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain(AUDIO_PATH);
    expect(logs).not.toContain("audiobooks");
    expect(logs).not.toContain("private-token");
  });

  it.each([null, ""])("does not sign a missing audio path: %s", async (audioPath) => {
    setupData(audioPath, "audiobooks");
    expect((await loadBookWorkspaceData(BOOK_ID))?.latestAudiobookAsset?.audioSignedUrl).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([
    { name: "anonymous caller", userId: null, authorId: "user-1" },
    { name: "non-owner", userId: "user-1", authorId: "other-user" },
  ])("does not sign for $name", async ({ userId, authorId }) => {
    setupData(AUDIO_PATH, "audiobooks", userId, authorId);
    expect(await loadBookWorkspaceData(BOOK_ID)).toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
});
