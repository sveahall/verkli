import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { storeImportFile } from "@/lib/import-storage";
import { enqueueExtractJob } from "@/lib/import-queue";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

const ALLOWED_EXT = [".epub", ".docx", ".html", ".htm", ".txt"];
const MAX_SIZE_MB = 50;
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function POST(request: Request) {
  assertPublicEnv();

  // SECURITY: Require author role for book import
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") ?? formData.get("book");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file (field: file or book)" }, { status: 400 });
  }

  const ext = file.name.includes(".") ? "." + file.name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported format. Allowed: ${ALLOWED_EXT.join(", ")}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB} MB)` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabaseAdmin = await createClient();
  const { data: importRow, error: insertError } = await supabaseAdmin
    .from("book_imports")
    .insert({
      author_id: user.id,
      file_name: file.name,
      file_path: "", // set after store
      file_storage: "local",
      status: "pending",
      progress: 0,
    })
    .select("id")
    .single();

  if (insertError || !importRow?.id) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create import record" },
      { status: 500 }
    );
  }

  const store = await storeImportFile(user.id, importRow.id, file.name, buffer);
  if (!store.ok) {
    await supabaseAdmin.from("book_imports").update({ status: "failed", error_message: store.error }).eq("id", importRow.id);
    return NextResponse.json({ error: store.error }, { status: 500 });
  }

  await supabaseAdmin
    .from("book_imports")
    .update({
      file_path: store.filePath,
      file_storage: store.fileStorage,
      status: "pending",
    })
    .eq("id", importRow.id);

  let jobId: string | null = null;
  try {
    jobId = await enqueueExtractJob({
      importId: importRow.id,
      filePath: store.filePath,
      fileStorage: store.fileStorage,
      authorId: user.id,
    });
  } catch (err) {
    console.warn("[import] Redis unreachable or enqueue failed:", err instanceof Error ? err.message : err, "— import record created (id:", importRow.id, "). Start Redis (docker compose up -d) and run worker.");
  }

  if (!jobId) {
    console.warn("[import] REDIS_URL not set or Redis unreachable. Import record created (id:", importRow.id, "). Start Redis (docker compose up -d) and run: npm run import-worker");
  }

  return NextResponse.json({
    id: importRow.id,
    status: "pending",
    progress: 0,
    message: jobId
      ? "Import queued"
      : "Import created; start Redis and run the worker to process (see server log).",
  });
}
