import { makeVideo, type TextToVideoOptions } from "@/lib/ai/textToVideo";
import { NextResponse } from "next/server";

/** Runway text→video often takes 1–2+ minutes. */
export const maxDuration = 300;

const RATIOS = ["1280:720", "720:1280", "1080:1920", "1920:1080"] as const;
const DURATIONS = [4, 6, 8] as const;

function parseBody(body: unknown): Partial<TextToVideoOptions> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const opts: Partial<TextToVideoOptions> = {};
  if (typeof o.promptText === "string" && o.promptText.trim()) opts.promptText = o.promptText.trim();
  if (typeof o.duration === "number" && DURATIONS.includes(o.duration as (typeof DURATIONS)[number])) opts.duration = o.duration as 4 | 6 | 8;
  if (typeof o.ratio === "string" && RATIOS.includes(o.ratio as (typeof RATIOS)[number])) opts.ratio = o.ratio as TextToVideoOptions["ratio"];
  if (typeof o.audio === "boolean") opts.audio = o.audio;
  return opts;
}

export async function POST(req: Request) {
  try {
    let options: Partial<TextToVideoOptions> = {};
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      options = parseBody(body) ?? {};
    }
    if (!options.promptText) {
      return NextResponse.json(
        { error: "promptText is required" },
        { status: 400 }
      );
    }
    const result = await makeVideo(options as TextToVideoOptions);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Text-to-video failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
