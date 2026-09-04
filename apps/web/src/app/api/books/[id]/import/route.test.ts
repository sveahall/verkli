import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_INVALID_BOOK_VERSION, E_INVALID_IMPORT_MODE } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  attestationInsert: vi.fn(),
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

// The attestation is written with the SERVICE-ROLE client, because the table
// deliberately has no INSERT policy. Mocking it here also documents that a
// session client would be silently rejected by RLS.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/imports/scoped-import", () => ({
  getImportFile: mocks.getImportFile,
  validateImportFile: mocks.validateImportFile,
  parseImportMode: mocks.parseImportMode,
  startScopedBookImport: mocks.startScopedBookImport,
}));

const { POST } = await import("./route");

/** A FormData carrying a complete, valid rights attestation. */
function attested(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append("attestHoldsRights", "true");
  fd.append("attestIsOwnWork", "true");
  fd.append("attestConsequences", "true");
  fd.append("attestPreviouslyPublished", "no");
  // set, not append: FormData.append adds a SECOND value and formData.get()
  // returns the first, so appending an override would silently do nothing.
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function makeMultipartRequest(formData?: FormData): Request {
  return new Request("http://localhost/api/books/book-1/import", {
    method: "POST",
    body: formData ?? new FormData(),
  });
}

function installDefaultMocks() {

  vi.clearAllMocks();

  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: { id: "author-1" },
    response: null,
  });

  mocks.createClient.mockResolvedValue({ from: vi.fn() });

  mocks.attestationInsert.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: "att-1" }, error: null }) }),
  });
  mocks.createAdminClient.mockReturnValue({
    from: (table: string) => {
      if (table === "book_rights_attestations") {
        return { insert: mocks.attestationInsert };
      }
      // audit_log mirror — fire-and-forget, must never fail the import.
      return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "aud-1" }, error: null }) }) }) };
    },
  });
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
}

describe("POST /api/books/[id]/import", () => {
  beforeEach(installDefaultMocks);

  it("forwards auth errors", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });

    const res = await POST(makeMultipartRequest(attested()), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });

    expect(res.status).toBe(401);
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  it("rejects invalid import mode payload", async () => {
    mocks.parseImportMode.mockReturnValueOnce(null);

    const res = await POST(makeMultipartRequest(attested()), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
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

    const form = attested();
    form.set("mode", "overwrite_draft");
    form.set("bookVersionId", "version-1");

    const res = await POST(makeMultipartRequest(form), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.startScopedBookImport).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "author-1",
        bookId: "00000000-0000-4000-8000-000000000001",
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

  it("returns safe error key from scoped import helper failures", async () => {
    mocks.startScopedBookImport.mockResolvedValueOnce({
      ok: false,
      status: 400,
      errorKey: E_INVALID_BOOK_VERSION,
      detail: "Cannot overwrite a published version",
    });

    const res = await POST(makeMultipartRequest(attested()), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_BOOK_VERSION);
    expect(body.detail).toBe("Cannot overwrite a published version");
  });
});

/**
 * The gate itself. This route has NO UI caller, which is the reason it is
 * gated at all: an attestation enforced only on the route the UI happens to use
 * is one curl away from being decorative.
 */
describe("POST /api/books/[id]/import — rights attestation", () => {
  beforeEach(installDefaultMocks);

  const params = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) };

  it("refuses an import with no attestation, and imports nothing", async () => {
    const res = await POST(makeMultipartRequest(new FormData()), params);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("RIGHTS_ATTESTATION_REQUIRED");
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
    expect(mocks.attestationInsert).not.toHaveBeenCalled();
  });

  // An <input type="checkbox"> submits "on" unless value="true" is set. A gate
  // that accepted anything truthy would pass a UI that forgot it — and would
  // pass anyone who guessed the field names.
  it('refuses "on" as affirmation', async () => {
    const form = attested();
    form.set("attestHoldsRights", "on");

    const res = await POST(makeMultipartRequest(form), params);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("RIGHTS_ATTESTATION_REQUIRED");
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  it("refuses when the publication question is unanswered", async () => {
    const form = attested();
    form.delete("attestPreviouslyPublished");

    const res = await POST(makeMultipartRequest(form), params);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("RIGHTS_ATTESTATION_INCOMPLETE");
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  // The record is the point. If it cannot be written, the import must not
  // happen — an attestation collected and lost is worse than none, because it
  // manufactures the appearance of diligence.
  it("refuses the import when the attestation cannot be recorded", async () => {
    mocks.attestationInsert.mockReturnValueOnce({
      select: () => ({
        single: async () => ({ data: null, error: { message: "relation does not exist" } }),
      }),
    });

    const res = await POST(makeMultipartRequest(attested()), params);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("RIGHTS_ATTESTATION_NOT_RECORDED");
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  });

  it("records the attestation BEFORE importing, with the wording that was shown", async () => {
    const res = await POST(
      makeMultipartRequest(
        attested({ attestPreviouslyPublished: "yes", attestPriorPublicationDetail: "Bonnier 2019" })
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(mocks.attestationInsert).toHaveBeenCalledTimes(1);

    const row = mocks.attestationInsert.mock.calls[0][0];
    expect(row.user_id).toBe("author-1");
    expect(row.holds_rights).toBe(true);
    expect(row.previously_published).toBe(true);
    expect(row.prior_publication_detail).toBe("Bonnier 2019");
    // The text, not just a version pointer into a git history nobody will
    // reconstruct during a dispute.
    expect(row.shown_wording).toMatchObject({ consequences: expect.any(String) });
    expect(row.wording_version).toBeTruthy();

    // Identity comes from the session, never the request body.
    expect(row.user_id).not.toBe(row.file_name);

    const attestOrder = mocks.attestationInsert.mock.invocationCallOrder[0];
    const importOrder = mocks.startScopedBookImport.mock.invocationCallOrder[0];
    expect(attestOrder).toBeLessThan(importOrder);
  });
});
