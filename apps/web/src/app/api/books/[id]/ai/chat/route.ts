import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const body = await request.json();
  const { message, chapterId, selectedText, history: _history } = body;

  // Template-based responses for common actions
  // In production, this would call an LLM API

  let response = "";
  const lowerMessage = message.toLowerCase();

  if (selectedText && (lowerMessage.includes("rewrite") || lowerMessage.includes("omskriv"))) {
    response = `Here's a suggested rewrite:\n\n"${selectedText.slice(0, 200)}..."\n\nConsider tightening the prose by removing filler words and strengthening active verbs. Focus on sensory details that ground the reader in the scene.`;
  } else if (lowerMessage.includes("pacing") || lowerMessage.includes("tempo")) {
    response = "To improve pacing in this section:\n\n1. Break long paragraphs into shorter beats\n2. Use shorter sentences during action\n3. Cut exposition that doesn't advance the plot\n4. Add white space between tense moments";
  } else if (lowerMessage.includes("expand") || lowerMessage.includes("utveckla")) {
    response = "To expand this scene, consider:\n\n• Add sensory details (what do characters see, hear, smell?)\n• Deepen internal monologue\n• Show character reactions through body language\n• Add dialogue that reveals character relationships";
  } else if (lowerMessage.includes("dialogue") || lowerMessage.includes("dialog")) {
    response = "Tips for stronger dialogue:\n\n• Each character should have a distinct voice\n• Cut dialogue tags where the speaker is clear\n• Use subtext — what characters don't say matters\n• Break up long speeches with action beats";
  } else {
    response = `I can help you with your writing! Try asking me to:\n\n• Rewrite selected text\n• Improve pacing\n• Expand a scene\n• Fix dialogue\n\nSelect text in the editor first for targeted suggestions.`;
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    role: "assistant",
    content: response,
    bookId,
    chapterId: chapterId ?? null,
  });
}
