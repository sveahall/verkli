import { NextResponse } from "next/server";

const MESSAGE = "PIPER_REMOVED: Lokal legacy-TTS har tagits bort. Använd Qwen3 TTS istället.";

export async function POST() {
  return NextResponse.json(
    {
      error: "PIPER_REMOVED",
      message: MESSAGE,
    },
    { status: 410 },
  );
}
