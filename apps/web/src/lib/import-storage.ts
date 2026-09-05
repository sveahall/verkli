/** Write-once import sources and ownership-checked worker reads. */
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/api-errors";
import * as fs from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import os from "node:os";

const BUCKET = "book-imports";
const MAX_BYTES = 50 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  ".epub": "application/epub+zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".htm": "text/html",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

export type ImportSourceRow = {
  id: string;
  author_id: string;
  file_name: string;
  file_path: string;
  file_storage: string;
};
export type ImportSource = {
  importId: string;
  authorId: string;
  extension: string;
  key: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  root: string;
  localPath: string;
};
export type StoreResult =
  | { ok: true; filePath: string; fileStorage: "local" | "supabase" }
  | { ok: false; error: string };

function sourceIdentity(authorId: string, importId: string, fileName: string) {
  if (!isValidUuid(authorId) || !isValidUuid(importId) || typeof fileName !== "string" ||
      !fileName.trim() || /[\0\\/]/.test(fileName)) {
    throw new Error("Import source invalid");
  }
  // Retain original extension case: older uploads may end in .TXT.
  const extension = path.extname(fileName);
  if (!CONTENT_TYPES[extension.toLowerCase()]) throw new Error("Import source invalid");
  return { extension, key: `${authorId}/${importId}${extension}` };
}

/** Pure validation: never normalize a supplied path into an accepted source. */
export function validateImportSource(row: ImportSourceRow, expectedAuthor: string): ImportSource {
  const { extension, key } = sourceIdentity(row.author_id, row.id, row.file_name);
  if (row.author_id !== expectedAuthor || !isValidUuid(expectedAuthor)) throw new Error("Import source invalid");
  const root = path.resolve(process.env.LOCAL_IMPORTS_DIR ?? path.join(process.cwd(), ".uploads", "imports"));
  const localPath = path.join(root, key);
  if (typeof row.file_path !== "string" || /[\0\\]/.test(row.file_path)) throw new Error("Import source invalid");
  if (row.file_storage === "supabase") {
    if (row.file_path !== key) throw new Error("Import source invalid");
  } else if (row.file_storage === "local") {
    if (process.env.NODE_ENV !== "development" || (row.file_path !== key && row.file_path !== localPath)) {
      throw new Error("Import source invalid");
    }
  } else {
    throw new Error("Import source invalid");
  }
  return { importId: row.id, authorId: row.author_id, extension, key, filePath: row.file_path,
    fileStorage: row.file_storage, root, localPath };
}

function isCollision(error: unknown): boolean {
  const e = error as { statusCode?: string | number; status?: number; message?: string } | null;
  return String(e?.statusCode ?? e?.status) === "409" || /already exists|duplicate/i.test(e?.message ?? "");
}

export async function storeImportFile(userId: string, importId: string, fileName: string, buffer: Buffer): Promise<StoreResult> {
  let identity: ReturnType<typeof sourceIdentity>;
  try { identity = sourceIdentity(userId, importId, fileName); }
  catch { return { ok: false, error: "Import source invalid" }; }
  try {
    const supabase = createAdminClient();
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError || !buckets?.some((bucket) => bucket.name === BUCKET)) {
      throw new Error("Import storage unavailable");
    }
    const { error } = await supabase.storage.from(BUCKET).upload(identity.key, buffer, {
      contentType: CONTENT_TYPES[identity.extension.toLowerCase()], upsert: false,
    });
    if (error) throw error;
    return { ok: true, filePath: identity.key, fileStorage: "supabase" };
  } catch (error) {
    const collision = isCollision(error);
    console.error("[import storage] upload failed", { importId, authorId: userId, category: collision ? "source_exists" : "unavailable" });
    if (collision || process.env.NODE_ENV !== "development") {
      return { ok: false, error: collision ? "Import source already exists" : "Import storage unavailable" };
    }
  }
  const source = validateImportSource({ id: importId, author_id: userId, file_name: fileName,
    file_path: identity.key, file_storage: "local" }, userId);
  try {
    await fs.mkdir(source.root, { recursive: true, mode: 0o700 });
    const rootStat = await fs.lstat(source.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Unsafe import directory");
    const canonicalRoot = await fs.realpath(source.root);
    const ownerPath = path.join(canonicalRoot, userId);
    await fs.mkdir(ownerPath, { recursive: true, mode: 0o700 });
    const owner = await fs.lstat(ownerPath);
    if (!owner.isDirectory() || owner.isSymbolicLink() || await fs.realpath(ownerPath) !== ownerPath) {
      throw new Error("Unsafe import directory");
    }
    const handle = await fs.open(path.join(ownerPath, `${importId}${identity.extension}`),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      if (!sameFile(owner, await fs.lstat(ownerPath)) || await fs.realpath(ownerPath) !== ownerPath) {
        throw new Error("Import directory changed");
      }
      await handle.writeFile(buffer);
    } finally { await handle.close(); }
    return { ok: true, filePath: source.localPath, fileStorage: "local" };
  } catch {
    console.error("[import storage] local write failed", { importId, authorId: userId, category: "local_source_unavailable" });
    return { ok: false, error: "Import file could not be saved" };
  }
}

function sameFile(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino && !second.isSymbolicLink();
}

async function readLocalSource(source: ImportSource): Promise<Buffer> {
  if (process.env.NODE_ENV !== "development") throw new Error("Import source invalid");
  const rootStat = await fs.lstat(source.root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Import source invalid");
  // realpath permits macOS's /var -> /private/var ancestor alias only.
  const canonicalRoot = await fs.realpath(source.root);
  const ownerPath = path.join(canonicalRoot, source.authorId);
  const filePath = path.join(ownerPath, `${source.importId}${source.extension}`);
  const ownerStat = await fs.lstat(ownerPath);
  if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink() || await fs.realpath(ownerPath) !== ownerPath) {
    throw new Error("Import source invalid");
  }
  const fileStat = await fs.lstat(filePath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || await fs.realpath(filePath) !== filePath || fileStat.size > MAX_BYTES) {
    throw new Error("Import source invalid");
  }
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFile(fileStat, opened) || opened.size !== fileStat.size ||
        !sameFile(rootStat, await fs.lstat(source.root)) || await fs.realpath(source.root) !== canonicalRoot ||
        !sameFile(ownerStat, await fs.lstat(ownerPath)) || await fs.realpath(ownerPath) !== ownerPath ||
        !sameFile(fileStat, await fs.lstat(filePath)) || await fs.realpath(filePath) !== filePath) {
      throw new Error("Import source changed");
    }
    // Read only the verified descriptor, with a bounded buffer even if a file grows.
    const buffer = Buffer.alloc(opened.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (offset !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
      throw new Error("Import source changed");
    }
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}

/** Parsers reopen paths: give them a private copy, never the validated original. */
export async function prepareImportSource(source: ImportSource): Promise<{ path: string; cleanup: () => Promise<void> }> {
  let bytes: Buffer;
  if (source.fileStorage === "local") {
    bytes = await readLocalSource(source);
  } else {
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(source.key);
    if (error || !data) throw new Error("Import source download failed");
    if (data.size > MAX_BYTES) throw new Error("Import source too large");
    bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error("Import source too large");
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-import-"));
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  try {
    await fs.chmod(directory, 0o700);
    const filePath = path.join(directory, `source${source.extension}`);
    await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    return { path: filePath, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
