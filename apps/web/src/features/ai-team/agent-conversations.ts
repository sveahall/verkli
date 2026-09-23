import { assistantToolSchema, type AssistantTool } from "@/lib/ai/agent-actions";
import type { AgentId } from "./agents";

export function conversationTool(tool: string): AssistantTool {
  const parsed = assistantToolSchema.safeParse(tool);
  return parsed.success ? parsed.data : "edit";
}
export const agentConversations: Record<AssistantTool, { agent: AgentId; role: string; greeting: string; prompts: string[] }> = {
  edit: { agent: "edith", role: "Your editor", greeting: "Bring me a passage, a spelling that feels wrong, or an idea. We’ll shape it together. You choose which changes to keep.", prompts: ["Find a spelling mistake and suggest a correction.", "Help this chapter sound more natural.", "Make the opening stronger without changing my voice."] },
  translate: { agent: "alma", role: "Your translator", greeting: "Tell me which word or phrase feels off in this edition. I’ll suggest a precise correction you can review in your chapter.", prompts: ["This wording feels unnatural. Help me improve it.", "Check the names and terms in this chapter.", "Keep my voice but make this passage read more naturally."] },
  audiobook: { agent: "august", role: "Your audiobook producer", greeting: "A name sounding strange? Tell me the word and how you want it to sound. We can listen to a corrected sample together.", prompts: ["Help me fix a word that is being pronounced incorrectly.", "Which names in this chapter should we listen to carefully?", "Help me make the narration sound more natural."] },
  cover: { agent: "stella", role: "Your cover collaborator", greeting: "Tell me what you want readers to feel. We’ll turn it into a visual brief, then generate new cover options for you to choose from.", prompts: ["I want a more elegant cover that fits this story.", "Help me create a new cover with a stronger atmosphere.", "Suggest a visual direction with fewer details."] },
  market: { agent: "stella", role: "Your marketer", greeting: "Let’s find the words that make someone want to open your book. We’ll prepare a draft; you decide where and when to share it.", prompts: ["Draft a short introduction to my book.", "Help me write an Instagram caption.", "Make this campaign copy feel more like me."] },
  pricing: { agent: "ernst", role: "Pricing & earnings", greeting: "Tell me your audience and what you’re considering. We can prepare a price for your review. Nothing changes until you save it.", prompts: ["Help me think through a price for this book.", "Prepare a price of 99 SEK for my review.", "Explain my pricing options."] },
  publish: { agent: "edith", role: "Your publishing guide", greeting: "Let’s check what your book needs before it meets its readers. Bring me your questions about the description or final review.", prompts: ["What should I check before publishing?", "Help me refine my book description.", "Does this description reveal too much?"] },
  review: { agent: "edith", role: "Your editor", greeting: "Let’s take one more look together. Tell me what you’re unsure about and I’ll help you plan the final changes.", prompts: ["Help me prepare a final manuscript review.", "Which parts of this chapter need another look?", "Help me check the pacing."] },
};
