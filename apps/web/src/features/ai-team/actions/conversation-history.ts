import type { AgentAction } from "@/lib/ai/agent-actions";

type Message = { role: "user" | "assistant"; content: string; failed?: boolean; actions?: AgentAction[]; outcomes?: (string | null)[] };
/** Carry concrete proposals into follow-ups; proposed actions are never reported as executed. */
export function buildConversationHistory(messages: Message[]) {
  return messages.filter((message) => !message.failed).slice(-12).map((message) => ({
    role: message.role,
    content: message.role === "assistant" && message.actions?.length
      ? JSON.stringify({ reply: message.content.slice(0, 900), proposals: message.actions.map((action, index) => ({
        ...Object.fromEntries(Object.entries(action).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 750) : value])),
        outcome: message.outcomes?.[index] ?? "Proposed only; no completed action reported.",
      })) }).slice(0, 4000)
      : message.content.slice(0, 4000),
  }));
}
