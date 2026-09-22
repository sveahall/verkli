import { z } from "zod";
import { assistantToolSchema } from "@/lib/ai/agent-actions";

export const MAX_MEMORIES = 24;
export const MAX_MEMORY_CHARS = 500;
export type MemoryScope = "author" | "book" | "edition";
export type Memory = { id: string; content: string; scope: MemoryScope; updatedAt: string };
export type MemorySnapshot = { enabled: boolean; memories: Memory[] };
export type SavedMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
export type SavedThread = { id: string; title: string; updatedAt: string };
export type ConversationSnapshot = { threads: SavedThread[]; thread: SavedThread | null; messages: SavedMessage[] };
export type Persistence = "saved" | "temporary" | "failed";

export const editionIdSchema = z.string().uuid().nullable().optional();
export const conversationInputSchema = z.object({
  threadId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
  editionId: editionIdSchema,
  temporary: z.boolean(),
}).strict();
export type ConversationInput = z.infer<typeof conversationInputSchema>;
export const memoryMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save"), id: z.string().uuid().optional(), content: z.string().trim().min(1).max(MAX_MEMORY_CHARS), scope: z.enum(["author", "book", "edition"]), editionId: editionIdSchema }).strict(),
  z.object({ operation: z.literal("delete"), id: z.string().uuid(), editionId: editionIdSchema }).strict(),
  z.object({ operation: z.literal("settings"), enabled: z.boolean(), editionId: editionIdSchema }).strict(),
]).refine((value) => value.operation !== "save" || value.scope !== "edition" || Boolean(value.editionId), { message: "Choose an edition for an edition memory.", path: ["editionId"] });
export const conversationMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), tool: assistantToolSchema, editionId: editionIdSchema }).strict(),
  z.object({ operation: z.literal("delete"), threadId: z.string().uuid() }).strict(),
]);
