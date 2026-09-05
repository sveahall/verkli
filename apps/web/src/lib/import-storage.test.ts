import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const mocks = vi.hoisted(() => ({ listBuckets: vi.fn(), upload: vi.fn(), download: vi.fn(), admin: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({ ...(await original<typeof import("node:fs/promises")>()) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { storeImportFile, validateImportSource, prepareImportSource } from "./import-storage";
const author = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const key = `${author}/${id}.TXT`;
const bytes = Buffer.from("Harmless synthetic import source.");
let fixture: string;
let root: string;
const row = (overrides = {}) => ({ id, author_id: author, file_name: "Manuscript.TXT", file_path: key, file_storage: "supabase", ...overrides });
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), "import-source-test-"));
  root = path.join(fixture, "imports");
  vi.stubEnv("LOCAL_IMPORTS_DIR", root);
  mocks.admin.mockReturnValue({ storage: { listBuckets: mocks.listBuckets, from: () => ({ upload: mocks.upload, download: mocks.download }) } });
  mocks.listBuckets.mockResolvedValue({ data: [{ name: "book-imports" }], error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(fixture, { recursive: true, force: true }); });
describe("owned import source", () => {
  it("preserves uppercase extension and accepts only generated local forms", () => {
    expect(validateImportSource(row(), author)).toMatchObject({ key, filePath: key, fileStorage: "supabase", extension: ".TXT" });
    expect(validateImportSource(row({ file_storage: "local" }), author).localPath).toBe(path.join(root, key));
    expect(validateImportSource(row({ file_storage: "local", file_path: path.join(root, key) }), author).key).toBe(key);
  });
  it.each([
    { id: "invalid" }, { author_id: other }, { file_name: "" }, { file_name: "book.exe" },
    { file_storage: "s3" }, { file_path: `${other}/${id}.TXT` }, { file_path: `${author}/${other}.TXT` },
    { file_path: `${author}/../${key}` }, { file_path: `https://example.test/${key}` },
    { file_path: key + "\0" }, { file_path: key.replace("/", "\\") },
    { file_storage: "local", file_path: "/tmp/forged.TXT" },
  ])("rejects invalid identity/source %j without I/O", (overrides) => {
    expect(() => validateImportSource(row(overrides), author)).toThrow("Import source invalid");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["production", "test"])("rejects local sources in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => validateImportSource(row({ file_storage: "local" }), author)).toThrow();
  });
});
describe("write-once storage", () => {
  it("uploads the derived key without overwriting", async () => {
    expect(await storeImportFile(author, id, "Manuscript.TXT", bytes)).toEqual({ ok: true, filePath: key, fileStorage: "supabase" });
    expect(mocks.upload).toHaveBeenCalledWith(key, bytes, { contentType: "text/plain", upsert: false });
  });
  it.each(["missing", "null", "list-error", "list-throw", "upload-error", "upload-throw"])("fails closed in production on %s without local writes", async (failure) => {
    vi.stubEnv("NODE_ENV", "production");
    if (failure === "missing") mocks.listBuckets.mockResolvedValue({ data: [], error: null });
    if (failure === "null") mocks.listBuckets.mockResolvedValue({ data: null, error: null });
    if (failure === "list-error") mocks.listBuckets.mockResolvedValue({ data: [{ name: "book-imports" }], error: { message: "offline" } });
    if (failure === "list-throw") mocks.listBuckets.mockRejectedValue(new Error("offline"));
    if (failure === "upload-error") mocks.upload.mockResolvedValue({ error: { message: "offline" } });
    if (failure === "upload-throw") mocks.upload.mockRejectedValue(new Error("offline"));
    expect(await storeImportFile(author, id, "Manuscript.TXT", bytes)).toMatchObject({ ok: false });
    await expect(fs.stat(root)).rejects.toThrow();
  });
  it("uses exclusive private local files in development and preserves duplicate bytes", async () => {
    mocks.listBuckets.mockResolvedValue({ data: [], error: null });
    expect(await storeImportFile(author, id, "Manuscript.TXT", bytes)).toMatchObject({ ok: true, fileStorage: "local" });
    expect((await fs.stat(path.join(root, key))).mode & 0o777).toBe(0o600);
    expect(await storeImportFile(author, id, "Manuscript.TXT", Buffer.from("replacement"))).toMatchObject({ ok: false });
    expect(await fs.readFile(path.join(root, key))).toEqual(bytes);
  });
  it("does not fall back after an object collision", async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: "409", message: "The resource already exists" } });
    expect(await storeImportFile(author, id, "Manuscript.TXT", bytes)).toMatchObject({ ok: false });
    await expect(fs.stat(root)).rejects.toThrow();
  });
  it("rejects invalid IDs before calling storage", async () => {
    expect(await storeImportFile("../forged", id, "file.txt", bytes)).toMatchObject({ ok: false });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("rejects symlink owner directories for local writes", async () => {
    mocks.listBuckets.mockResolvedValue({ data: [], error: null });
    await fs.mkdir(root);
    await fs.mkdir(path.join(fixture, "outside"));
    await fs.symlink(path.join(fixture, "outside"), path.join(root, author));
    expect(await storeImportFile(author, id, "Manuscript.TXT", bytes)).toMatchObject({ ok: false });
    expect(await fs.readdir(path.join(fixture, "outside"))).toEqual([]);
  });
});
describe("private worker preparation", () => {
  async function localSource() {
    await fs.mkdir(path.join(root, author), { recursive: true });
    await fs.writeFile(path.join(root, key), bytes);
    return validateImportSource(row({ file_storage: "local" }), author);
  }
  it("copies local bytes into private distinct parser paths with independent cleanup", async () => {
    const source = await localSource();
    const first = await prepareImportSource(source);
    const second = await prepareImportSource(source);
    try {
      expect(first.path).not.toBe(source.localPath);
      expect(first.path).not.toBe(second.path);
      expect((await fs.stat(path.dirname(first.path))).mode & 0o777).toBe(0o700);
      expect((await fs.stat(first.path)).mode & 0o777).toBe(0o600);
      expect(await fs.readFile(first.path)).toEqual(bytes);
      await first.cleanup();
      expect(await fs.readFile(second.path)).toEqual(bytes);
      expect(await fs.readFile(source.localPath!)).toEqual(bytes);
    } finally { await first.cleanup(); await second.cleanup(); }
  });
  it("downloads only the exact owned key into a private path", async () => {
    const prepared = await prepareImportSource(validateImportSource(row(), author));
    try { expect(mocks.download).toHaveBeenCalledExactlyOnceWith(key); expect(await fs.readFile(prepared.path)).toEqual(bytes); }
    finally { await prepared.cleanup(); }
    await expect(fs.stat(prepared.path)).rejects.toThrow();
  });
  it.each(["leaf", "parent"])("rejects a symlink %s without reading target bytes", async (kind) => {
    const source = await localSource();
    const outside = path.join(fixture, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, `${id}.TXT`), bytes);
    if (kind === "leaf") {
      await fs.unlink(source.localPath!);
      await fs.symlink(path.join(outside, `${id}.TXT`), source.localPath!);
    } else {
      await fs.rm(path.join(root, author), { recursive: true });
      await fs.symlink(outside, path.join(root, author));
    }
    const open = vi.spyOn(fs, "open");
    await expect(prepareImportSource(source)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it("rejects replacement between lstat and open before descriptor read", async () => {
    const source = await localSource();
    const realOpen = fs.open;
    const read = vi.fn();
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      await fs.rename(source.localPath!, path.join(fixture, "original.TXT"));
      await fs.writeFile(source.localPath!, "replacement");
      const handle = await realOpen(...args);
      vi.spyOn(handle, "read").mockImplementation(read);
      return handle;
    });
    await expect(prepareImportSource(source)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
