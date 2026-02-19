import { NextResponse } from "next/server";

const MESSAGE = "LEGACY_TTS_REMOVED: Lokal legacy-TTS har tagits bort. Använd Qwen3 TTS istället.";

export async function POST() {
  return NextResponse.json(
    {
      error: "LEGACY_TTS_REMOVED",
      code: "LEGACY_TTS_REMOVED",
      message: MESSAGE,
    },
    { status: 410 },
  );
}
