/**
 * Store uploaded import file: Supabase Storage when bucket exists, else local disk in dev.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BUCKET = "book-imports";
const LOCAL_IMPORTS_DIR = process.env.LOCAL_IMPORTS_DIR ?? path.join(process.cwd(), ".uploads", "imports");

export type StoreResult =
  | { ok: true; filePath: string; fileStorage: "local" | "supabase" }
  | { ok: false; error: string };

/**
 * Store file buffer. Uses Supabase Storage if bucket is available (prod), else local disk (dev).
 */
export async function storeImportFile(
  userId: string,
  importId: string,
  fileName: string,
  buffer: Buffer
): Promise<StoreResult> {
  const ext = path.extname(fileName) || "";
  const safeName = `${importId}${ext}`;
  const storagePath = `${userId}/${safeName}`;

  try {
    const supabase = createAdminClient();
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = buckets?.some((b) => b.name === BUCKET);

    if (hasBucket) {
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType: getContentType(ext),
        upsert: true,
      });
      if (error) {
        if (process.env.NODE_ENV === "development") {
          return storeLocal(userId, importId, fileName, buffer);
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, filePath: storagePath, fileStorage: "supabase" };
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "development") {
      return { ok: false, error: e instanceof Error ? e.message : "Storage error" };
    }
  }

  return storeLocal(userId, importId, fileName, buffer);
}

async function storeLocal(
  userId: string,
  importId: string,
  fileName: string,
  buffer: Buffer
): Promise<StoreResult> {
  const dir = path.join(LOCAL_IMPORTS_DIR, userId);
  try {
    await mkdir(dir, { recursive: true });
    const ext = path.extname(fileName) || "";
    const base = `${importId}${ext}`;
    const filePath = path.join(dir, base);
    await writeFile(filePath, buffer);
    return { ok: true, filePath, fileStorage: "local" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Local write failed" };
  }
}

function getContentType(ext: string): string {
  const m: Record<string, string> = {
    ".epub": "application/epub+zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".html": "text/html",
    ".htm": "text/html",
    ".txt": "text/plain",
  };
  return m[ext.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve file path to absolute path for local storage (worker reads from disk).
 */
export function resolveLocalImportPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(LOCAL_IMPORTS_DIR, filePath);
}
