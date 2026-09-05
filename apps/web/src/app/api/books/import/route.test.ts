import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_RIGHTS_ATTESTATION_NOT_RECORDED,
  E_RIGHTS_ATTESTATION_REQUIRED,
} from "@/lib/api-errors";
import { RIGHTS_WORDING, RIGHTS_WORDING_VERSION } from "@/lib/imports/attestation";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  bookSelect: vi.fn(),
  bookEq: vi.fn(),
  bookLookup: vi.fn(),
  attestationInsert: vi.fn(),
  attestationUpdate: vi.fn(),
  attestationLinkEq: vi.fn(),
  auditInsert: vi.fn(),
  importInsert: vi.fn(),
  importUpdate: vi.fn(),
  importUpdateEq: vi.fn(),
  sourceResult: vi.fn(),
  startScopedBookImport: vi.fn(),
  storeImportFile: vi.fn(),
  enqueueExtractJob: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/import-storage", () => ({ storeImportFile: mocks.storeImportFile }));
vi.mock("@/lib/import-queue", () => ({ enqueueExtractJob: mocks.enqueueExtractJob }));
vi.mock("@/lib/imports/scoped-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imports/scoped-import")>()),
  startScopedBookImport: mocks.startScopedBookImport,
}));

// Keep getBookAsOwner, attestation, and audit real. Mock only their clients.
const { POST } = await import("./route");

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_AUTHOR_ID = "00000000-0000-4000-8000-000000000003";
const VERSION_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_VERSION_ID = "00000000-0000-4000-8000-000000000005";
const FILE_TEXT = "Synthetic WP22 regression manuscript.";
const session = { from: mocks.sessionFrom };

function selectedId(id: string) {
  return {
    select: () => ({ single: async () => ({ data: { id }, error: null }) }),
  };
}

function makeMultipartRequest({
  bookId,
  withRights = true,
  extra = {},
}: {
  bookId?: string;
  withRights?: boolean;
  extra?: Record<string, string>;
} = {}): Request {
  const form = new FormData();
  form.set("file", new File([FILE_TEXT], "wp22.txt", { type: "text/plain" }));
  if (bookId !== undefined) form.set("bookId", bookId);
  if (withRights) {
    form.set("attestHoldsRights", "true");
    form.set("attestIsOwnWork", "true");
    form.set("attestConsequences", "true");
    form.set("attestPreviouslyPublished", "no");
  }
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request("http://localhost/api/books/import", {
    method: "POST",
    body: form,
  });
}

function expectNoImportEffects() {
  expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
  expect(mocks.importInsert).not.toHaveBeenCalled();
  expect(mocks.importUpdate).not.toHaveBeenCalled();
  expect(mocks.storeImportFile).not.toHaveBeenCalled();
  expect(mocks.enqueueExtractJob).not.toHaveBeenCalled();
  expect(mocks.attestationUpdate).not.toHaveBeenCalled();
}

function expectNoDurableEffects() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.attestationInsert).not.toHaveBeenCalled();
  expect(mocks.auditInsert).not.toHaveBeenCalled();
  expectNoImportEffects();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.requireAuthorRoleForApi.mockResolvedValue({ user: { id: AUTHOR_ID }, response: null });
  mocks.createClient.mockResolvedValue(session);
  mocks.bookLookup.mockResolvedValue({
    data: { id: BOOK_ID, author_id: AUTHOR_ID },
    error: null,
  });
  mocks.bookEq.mockReturnValue({ maybeSingle: mocks.bookLookup });
  mocks.bookSelect.mockReturnValue({ eq: mocks.bookEq });
  mocks.importInsert.mockImplementation(() => selectedId("imp-legacy"));
  const updateQuery = {
    eq: mocks.importUpdateEq,
    select: () => ({ maybeSingle: mocks.sourceResult }),
    then: (resolve: (result: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
  };
  mocks.importUpdateEq.mockReturnValue(updateQuery);
  mocks.sourceResult.mockResolvedValue({ data: { id: "imp-legacy" }, error: null });
  mocks.importUpdate.mockReturnValue(updateQuery);
  mocks.sessionFrom.mockImplementation((table: string) => {
    if (table === "books") return { select: mocks.bookSelect };
    throw new Error(`Unexpected session table: ${table}`);
  });
  mocks.attestationInsert.mockImplementation(() => selectedId("att-1"));
  mocks.attestationLinkEq.mockResolvedValue({ error: null });
  mocks.attestationUpdate.mockReturnValue({ eq: mocks.attestationLinkEq });
  mocks.auditInsert.mockImplementation(() => selectedId("audit-1"));
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === "book_imports") return { insert: mocks.importInsert, update: mocks.importUpdate };
    if (table === "book_rights_attestations") {
      return { insert: mocks.attestationInsert, update: mocks.attestationUpdate };
    }
    if (table === "audit_log") return { insert: mocks.auditInsert };
    throw new Error(`Unexpected admin table: ${table}`);
  });
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom });
  mocks.startScopedBookImport.mockResolvedValue({
    ok: true,
    importId: "imp-scoped",
    jobId: "job-scoped",
    mode: "overwrite_draft",
    targetVersionId: VERSION_ID,
    message: "Import queued",
  });
  mocks.storeImportFile.mockResolvedValue({
    ok: true,
    filePath: "synthetic/wp22.txt",
    fileStorage: "local",
  });
  mocks.enqueueExtractJob.mockResolvedValue("job-legacy");
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/books/import ownership before attestation", () => {
  it("forwards author-role denial before creating clients or importing", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 }),
    });

    const response = await POST(makeMultipartRequest({ bookId: BOOK_ID }));

    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expectNoDurableEffects();
  });

  it("rejects an invalid bookId before recording any attestation", async () => {
    const response = await POST(makeMultipartRequest({ bookId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: E_INVALID_BOOK_ID });
    expectNoDurableEffects();
    expect(mocks.bookLookup).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "another author's book",
      lookup: { data: { id: BOOK_ID, author_id: OTHER_AUTHOR_ID }, error: null },
      status: 404,
      error: E_BOOK_NOT_FOUND,
    },
    {
      name: "a missing book",
      lookup: { data: null, error: null },
      status: 404,
      error: E_BOOK_NOT_FOUND,
    },
    {
      name: "a database lookup failure",
      lookup: { data: null, error: { code: "08006", message: "lookup unavailable" } },
      status: 500,
      error: E_DATABASE_ERROR,
    },
  ])("rejects $name without durable effects", async ({ lookup, status, error }) => {
    mocks.bookLookup.mockResolvedValueOnce(lookup);

    const response = await POST(makeMultipartRequest({ bookId: BOOK_ID }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
    expect(mocks.bookEq).toHaveBeenCalledWith("id", BOOK_ID);
    expectNoDurableEffects();
    if (error === E_DATABASE_ERROR) {
      expect(console.error).toHaveBeenCalled();
    }
  });

  it.each<{ name: string; versions: Record<string, string> }>([
    { name: "bookVersionId precedence", versions: { bookVersionId: VERSION_ID, targetVersionId: OTHER_VERSION_ID } },
    { name: "targetVersionId fallback", versions: { targetVersionId: VERSION_ID } },
  ])("preserves an owned scoped import with $name", async ({ versions }) => {
    const response = await POST(makeMultipartRequest({
      bookId: ` ${BOOK_ID} `,
      extra: {
        ...versions,
        overwrite: "true",
        attestPreviouslyPublished: "yes",
        attestPriorPublicationDetail: "Synthetic prior publication",
        userId: OTHER_AUTHOR_ID,
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "imp-scoped",
      jobId: "job-scoped",
      status: "pending",
      progress: 0,
      mode: "overwrite_draft",
      targetVersionId: VERSION_ID,
      message: "Import queued",
    });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.bookLookup).toHaveBeenCalledTimes(1);
    expect(mocks.bookEq).toHaveBeenCalledWith("id", BOOK_ID);
    expect(mocks.attestationInsert).toHaveBeenCalledTimes(1);
    expect(mocks.attestationInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: AUTHOR_ID,
      book_id: BOOK_ID,
      file_name: "wp22.txt",
      wording_version: RIGHTS_WORDING_VERSION,
      shown_wording: RIGHTS_WORDING,
      holds_rights: true,
      is_own_work: true,
      consequences_acknowledged: true,
      previously_published: true,
      prior_publication_detail: "Synthetic prior publication",
    }));
    expect(mocks.startScopedBookImport).toHaveBeenCalledTimes(1);
    expect(mocks.startScopedBookImport).toHaveBeenCalledWith({
      supabase: session,
      userId: AUTHOR_ID,
      bookId: BOOK_ID,
      file: expect.any(File),
      mode: "overwrite_draft",
      targetVersionId: VERSION_ID,
    });
    expect(mocks.bookLookup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.attestationInsert.mock.invocationCallOrder[0]
    );
    expect(mocks.attestationInsert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startScopedBookImport.mock.invocationCallOrder[0]
    );
    expect(mocks.startScopedBookImport.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.attestationUpdate.mock.invocationCallOrder[0]
    );
    expect(mocks.attestationUpdate).toHaveBeenCalledExactlyOnceWith({
      book_import_id: "imp-scoped",
      book_id: BOOK_ID,
    });
    expect(mocks.attestationLinkEq).toHaveBeenCalledWith("id", "att-1");
    expect(mocks.auditInsert).toHaveBeenCalledTimes(1);
    expect(mocks.importInsert).not.toHaveBeenCalled();
    expect(mocks.storeImportFile).not.toHaveBeenCalled();
    expect(mocks.enqueueExtractJob).not.toHaveBeenCalled();
  });

  it.each([undefined, "   "])("preserves the no-bookId path for %s", async (bookId) => {
    const response = await POST(makeMultipartRequest({ bookId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "imp-legacy",
      jobId: "job-legacy",
      status: "pending",
      progress: 0,
      mode: "new_version",
      message: "Import queued",
    });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.bookLookup).not.toHaveBeenCalled();
    expect(mocks.startScopedBookImport).not.toHaveBeenCalled();
    expect(mocks.attestationInsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      user_id: AUTHOR_ID,
      book_id: null,
      file_name: "wp22.txt",
      wording_version: RIGHTS_WORDING_VERSION,
      shown_wording: RIGHTS_WORDING,
    }));
    expect(mocks.importInsert).toHaveBeenCalledExactlyOnceWith({
      author_id: AUTHOR_ID,
      file_name: "wp22.txt",
      file_path: "",
      file_storage: "local",
      mode: "new_version",
      status: "pending",
      progress: 0,
    });
    expect(mocks.attestationUpdate).toHaveBeenCalledExactlyOnceWith({ book_import_id: "imp-legacy" });
    expect(mocks.attestationLinkEq).toHaveBeenCalledWith("id", "att-1");
    expect(mocks.auditInsert).toHaveBeenCalledTimes(1);
    expect(mocks.storeImportFile).toHaveBeenCalledExactlyOnceWith(
      AUTHOR_ID, "imp-legacy", "wp22.txt", Buffer.from(FILE_TEXT)
    );
    expect(mocks.importUpdate).toHaveBeenCalledExactlyOnceWith({
      file_path: "synthetic/wp22.txt",
      file_storage: "local",
      status: "pending",
      error_message: null,
    });
    expect(mocks.enqueueExtractJob).toHaveBeenCalledExactlyOnceWith({
      importId: "imp-legacy",
      filePath: "synthetic/wp22.txt",
      fileStorage: "local",
      authorId: AUTHOR_ID,
      mode: "new_version",
      targetVersionId: null,
    });
    const effects = [
      mocks.attestationInsert, mocks.importInsert, mocks.attestationUpdate,
      mocks.storeImportFile, mocks.importUpdate, mocks.enqueueExtractJob,
    ];
    for (let index = 1; index < effects.length; index += 1) {
      expect(effects[index - 1].mock.invocationCallOrder[0]).toBeLessThan(
        effects[index].mock.invocationCallOrder[0]
      );
    }
  });

  it.each([BOOK_ID, undefined])("rejects missing rights for bookId %s", async (bookId) => {
    const response = await POST(makeMultipartRequest({ bookId, withRights: false }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: E_RIGHTS_ATTESTATION_REQUIRED });
    expectNoDurableEffects();
  });

  it.each([BOOK_ID, undefined])("keeps ledger-write failure blocking for bookId %s", async (bookId) => {
    mocks.attestationInsert.mockReturnValueOnce({
      select: () => ({
        single: async () => ({ data: null, error: { message: "synthetic write failure" } }),
      }),
    });

    const response = await POST(makeMultipartRequest({ bookId }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: E_RIGHTS_ATTESTATION_NOT_RECORDED });
    expect(mocks.attestationInsert).toHaveBeenCalledTimes(1);
    expect(mocks.auditInsert).not.toHaveBeenCalled();
    expectNoImportEffects();
  });
});


describe("legacy import durable dispatch", () => {
  it("guards the initial source write by import, owner and empty path", async () => {
    expect((await POST(makeMultipartRequest())).status).toBe(200);
    expect(mocks.importUpdateEq.mock.calls).toEqual([["id", "imp-legacy"], ["author_id", AUTHOR_ID], ["file_path", ""]]);
  });
  it("handles a rejected insert request", async () => {
    mocks.importInsert.mockReturnValue({ select: () => ({ single: async () => { throw new Error("synthetic rejected insert"); } }) });
    expect((await POST(makeMultipartRequest())).status).toBe(500);
    expect(mocks.storeImportFile).not.toHaveBeenCalled();
  });
  it("handles a rejected source request", async () => {
    mocks.sourceResult.mockRejectedValue(new Error("synthetic rejected source write"));
    expect((await POST(makeMultipartRequest())).status).toBe(500);
    expect(mocks.enqueueExtractJob).not.toHaveBeenCalled();
  });
  it.each(["error", "no-row"])("requires a returned source row after %s", async (failure) => {
    mocks.sourceResult.mockResolvedValue({ data: null, error: failure === "error" ? { message: "synthetic source write failure" } : null });
    expect((await POST(makeMultipartRequest())).status).toBe(500);
    expect(mocks.enqueueExtractJob).not.toHaveBeenCalled();
  });
  it.each(["null", "throw"])("reports queue %s as unavailable", async (failure) => {
    if (failure === "null") mocks.enqueueExtractJob.mockResolvedValue(null);
    else mocks.enqueueExtractJob.mockRejectedValue(new Error("synthetic queue failure"));
    const response = await POST(makeMultipartRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "QUEUE_UNAVAILABLE" });
    expect(mocks.importUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
    expect(mocks.importUpdateEq).toHaveBeenCalledWith("author_id", AUTHOR_ID);
  });
});
