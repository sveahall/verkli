import { z } from "zod";

const savedMessages = z.array(z.object({
  id: z.string().min(1), role: z.enum(["user", "assistant"]), content: z.string(),
})).max(50);

/** History is readable evidence, never an executable proposal against a newer manuscript. */
export function restoreTranscript(value: unknown) {
  return savedMessages.parse(value).map(({ id, role, content }) => ({ id, role, content, historical: true as const }));
}
