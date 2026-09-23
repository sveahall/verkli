import { createPrivateExportHandlers } from "@/lib/audiobook/private-export-handler";
import { createPrivateExportDependencies } from "@/lib/audiobook/private-export-supabase";

export const runtime = "nodejs";
export const maxDuration = 120;
const handlers = createPrivateExportHandlers(createPrivateExportDependencies());
export const GET = handlers.GET;
export const POST = handlers.POST;
