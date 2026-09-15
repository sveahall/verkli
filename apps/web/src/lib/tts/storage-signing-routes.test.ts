import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAuthorJobs } from "@/app/api/author/jobs/route";
import { GET as getBookJobs } from "@/app/api/books/[id]/jobs/route";
import { GET as getAudiobookStatus } from "@/app/api/books/[id]/audiobook/status/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireAuthorRoleForApi: vi.fn(),
  getAudiobookStorageBucket: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.requireAuthorRoleForApi }));
vi.mock("@/lib/tts/storage", () => ({ getAudiobookStorageBucket: mocks.getAudiobookStorageBucket }));
vi.mock("@/lib/flags", () => ({ isAudiobookEnabled: () => true }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn() }));
vi.mock("@/lib/billing/server", () => ({
  getBillingStateForUser: async () => ({ ok: true, state: { isProActive: true } }),
}));

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_BOOK_ID = "00000000-0000-4000-8000-000000000002";
const CHAPTER_ID = "00000000-0000-4000-8000-000000000003";
const paths = {
  audio: `${BOOK_ID}/audiobook-1770000000000.mp3`,
  manifest: `${BOOK_ID}/audiobook-manifest-1770000000000.json`,
  chapter: `cache/${BOOK_ID}/${CHAPTER_ID}-0123456789abcdef.wav`,
  asset: `${BOOK_ID}/audiobook-1770000000000.wav`,
};
const fields = {
  audio: ["audioPath", "audioBucket", "audioUrl"],
  manifest: ["manifestPath", "manifestBucket", "manifestUrl"],
  chapter: ["generatedChapterAudioPath", "generatedChapterAudioBucket", "generatedChapterAudioUrl"],
  asset: ["audio_path", "audio_bucket", "assetAudioUrl"],
} as const;

const routes = [
  { name: "author jobs", get: () => getAuthorJobs(), assets: true },
  {
    name: "book jobs",
    get: () => getBookJobs(new Request("http://localhost/api/books/jobs"), { params: Promise.resolve({ id: BOOK_ID }) }),
    assets: false,
  },
  {
    name: "audiobook status",
    get: () => getAudiobookStatus(new Request("http://localhost/api/books/audiobook/status"), { params: Promise.resolve({ id: BOOK_ID }) }),
    assets: true,
  },
];

function setupData(output: Record<string, unknown>, asset: Record<string, unknown> | null = null, authorId = "user-1") {
  const job = {
    id: "job-1", kind: "audiobook_generation", status: "completed", book_id: BOOK_ID,
    input: { bookId: OTHER_BOOK_ID }, output, error: null, progress: 100,
    created_at: "2026-09-14T10:00:00Z", updated_at: "2026-09-14T10:00:00Z",
    started_at: null, finished_at: null,
  };
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (table === "books") return [{ id: BOOK_ID, title: "Owned book", author_id: authorId, audiobook_status: "not_started" }];
        if (table === "audiobook_assets") return asset ? [{ id: "asset-1", book_id: BOOK_ID, status: "generated", ...asset }] : [];
        if (table === "ai_jobs") return filters["is:book_id"] === null ? [] : [job];
        if (["book_imports", "book_versions", "marketing_campaigns"].includes(table)) return [];
        throw new Error(`Unexpected table: ${table}`);
      };
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
        is: (key: string, value: unknown) => { filters[`is:${key}`] = value; return chain; },
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve),
      };
      return chain;
    },
  });
}

describe.each(routes)("$name storage signing", (route) => {
  const sign = vi.fn();
  const storageFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.getAudiobookStorageBucket.mockReturnValue("audiobooks");
    sign.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed.invalid/${path}` }, error: null }));
    storageFrom.mockReturnValue({ createSignedUrl: sign });
    mocks.createAdminClient.mockReturnValue({ storage: { from: storageFrom } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  for (const channel of Object.keys(paths) as Array<keyof typeof paths>) {
    if (channel === "asset" && !route.assets) continue;
    const [pathField, bucketField, urlField] = fields[channel];

    async function request(path: unknown, bucket: unknown) {
      const reference = { [pathField]: path, [bucketField]: bucket };
      setupData(channel === "asset" ? {} : reference, channel === "asset" ? reference : null);
      const response = await route.get();
      expect(response.status).toBe(200);
      const body = await response.json();
      const url = route.name === "audiobook status"
        ? channel === "asset" ? body.asset.audioUrl : body.job[urlField]
        : body.jobs[0].meta[urlField];
      return { body, url };
    }

    it.each(["audiobooks", undefined, null, ""])(`signs owned ${channel} with compatible bucket metadata %s`, async (bucket) => {
      const { url } = await request(paths[channel], bucket);
      expect(url).toBe(`https://signed.invalid/${paths[channel]}`);
      expect(storageFrom).toHaveBeenCalledExactlyOnceWith("audiobooks");
      expect(sign).toHaveBeenCalledExactlyOnceWith(paths[channel], 900);
    });

    it.each([
      ["foreign bucket", paths[channel], "book-downloads"],
      ["malformed bucket", paths[channel], { name: "audiobooks" }],
      ["another book", paths[channel].replace(BOOK_ID, OTHER_BOOK_ID), "audiobooks"],
      ["book prefix collision", paths[channel].replace(BOOK_ID, `${BOOK_ID}-extra`), "audiobooks"],
      ["path traversal", `${BOOK_ID}/../${OTHER_BOOK_ID}/audiobook-1.wav`, "audiobooks"],
      ["encoded traversal", `${BOOK_ID}/%2e%2e/${OTHER_BOOK_ID}/audiobook-1.wav`, "audiobooks"],
      ["absolute URL", "https://private.invalid/file?token=private-token", "audiobooks"],
    ])(`rejects ${channel}: %s before storage access`, async (_name, path, bucket) => {
      const { url } = await request(path, bucket);
      expect(url).toBeNull();
      expect(storageFrom).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-token");
    });
  }

  it("signs only the valid reference when sibling outputs belong to another book", async () => {
    setupData({ audioPath: paths.audio, audioBucket: "audiobooks", manifestPath: paths.manifest.replace(BOOK_ID, OTHER_BOOK_ID), manifestBucket: "audiobooks", generatedChapterAudioPath: paths.chapter.replace(BOOK_ID, OTHER_BOOK_ID), generatedChapterAudioBucket: "audiobooks" });
    expect((await route.get()).status).toBe(200);
    expect(sign).toHaveBeenCalledExactlyOnceWith(paths.audio, 900);
  });

  it("uses the configured bucket instead of a hardcoded default", async () => {
    mocks.getAudiobookStorageBucket.mockReturnValue("private-audiobooks");
    setupData({ audioPath: paths.audio, audioBucket: "private-audiobooks" });
    expect((await route.get()).status).toBe(200);
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith("private-audiobooks");
  });

  it("does not expose a storage error containing a private signed URL in logs", async () => {
    sign.mockResolvedValue({ data: null, error: { message: "Failed https://private.invalid/file?token=private-token" } });
    setupData({ audioPath: paths.audio, audioBucket: "audiobooks" });
    expect((await route.get()).status).toBe(200);
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-token");
  });

  if (route.name === "author jobs") {
    it("does not use an unvalidated URL from stored output as a preview fallback", async () => {
      setupData({ audioUrl: "https://private.invalid/file?token=private-token" });
      const body = await (await route.get()).json();
      expect(body.jobs[0].previewUrl).toBeNull();
      expect(body.jobs[0].meta.audioUrl).toBeNull();
      expect(sign).not.toHaveBeenCalled();
    });
  }

  it("does not sign when authentication is denied", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await route.get()).status).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });

  if (route.name !== "author jobs") {
    it("does not sign when book ownership is denied", async () => {
      setupData({ audioPath: paths.audio, audioBucket: "audiobooks" }, null, "other-user");
      expect((await route.get()).status).toBe(404);
      expect(sign).not.toHaveBeenCalled();
    });
  }
});
