import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_INVALID_IMPORT_MODE } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  getImportFile: vi.fn(),
  validateImportFile: vi.fn(),
  parseImportMode: vi.fn(),
  startScopedBookImport: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/imports/scoped-import", () => ({
  getImportFile: mocks.getImportFile,
  validateImportFile: mocks.validateImportFile,
  parseImportMode: mocks.parseImportMode,
  startScopedBookImport: mocks.startScopedBookImport,
}));

const { POST } = await import("./route");

function makeMultipartRequest(formData?: FormData): Request {
  return new Request("http://localhost/api/books/book-1/import", {
    method: "POST",
    body: formData ?? new FormData(),
  });
}

describe("POST /api/books/[id]/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });

    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.getImportFile.mockReturnValue(new File(["chapter"], "book.txt", { type: "text/plain" }));
    mocks.validateImportFile.mockReturnValue(null);
    mocks.parseImportMode.mockReturnValue("new_version");
    mocks.startScopedBookImport.mockResolvedValue({
      ok: true,
      importId: "imp-1",
      jobId: "job-1",
      mode: "new_version",
      targetVersionId: null,
      message: "Import queued",
    });
  });

  it("forwards auth errors", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });

    const res = await POST(makeMultipartRequest(), {
      params: Promise.resolve({ id: "book-1" }),
    });

    expect(res.status).toBe(401);
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  it("rejects invalid import mode payload", async () => {
    mocks.parseImportMode.mockReturnValueOnce(null);

    const res = await POST(makeMultipartRequest(), {
      params: Promise.resolve({ id: "book-1" }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_IMPORT_MODE);
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  it("passes mode + draft version payload to scoped import service", async () => {
    mocks.parseImportMode.mockReturnValueOnce("overwrite_draft");
    mocks.startScopedBookImport.mockResolvedValueOnce({
      ok: true,
      importId: "imp-1",
      jobId: "job-1",
      mode: "overwrite_draft",
      targetVersionId: "version-1",
      message: "Import queued",
    });

    const form = new FormData();
    form.set("mode", "overwrite_draft");
    form.set("bookVersionId", "version-1");

    const res = await POST(makeMultipartRequest(form), {
      params: Promise.resolve({ id: "book-1" }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.startScopedBookImport).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "author-1",
        bookId: "book-1",
        mode: "overwrite_draft",
        targetVersionId: "version-1",
      })
    );
    expect(body).toMatchObject({
      id: "imp-1",
      jobId: "job-1",
      mode: "overwrite_draft",
      targetVersionId: "version-1",
    });
  });
});
