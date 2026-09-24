import { createFullBookExportHandlers } from "@/lib/audiobook/full-book-export-handler";
import { createFullBookExportRuntime } from "@/lib/audiobook/full-book-export-supabase";
export const runtime = "nodejs";
const handlers = createFullBookExportHandlers(createFullBookExportRuntime());
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
