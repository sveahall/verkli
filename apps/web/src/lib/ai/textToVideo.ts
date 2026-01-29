import RunwayML, { TaskFailedError } from "@runwayml/sdk";

const DEFAULT_PROMPT =
  "A cinematic 5-second shot, handheld, shallow depth of field";

export type TextToVideoOptions = {
  /** Text prompt describing the video (1–1000 chars). Required. */
  promptText: string;
  /** Duration in seconds. Veo 3.1: 4, 6, or 8. Default: 6. */
  duration?: 4 | 6 | 8;
  /** Output ratio. Default: "1280:720". */
  ratio?: "1280:720" | "720:1280" | "1080:1920" | "1920:1080";
  /** Generate audio for the video. Affects pricing. Default: false. */
  audio?: boolean;
};

/** Text → short video via Runway veo3.1_fast. Returns task output or throws. */
export async function makeVideo(options: TextToVideoOptions) {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) {
    throw new Error(
      "RUNWAYML_API_SECRET is missing. Provide it before using text-to-video."
    );
  }

  const client = new RunwayML({ apiKey });
  const promptText = options.promptText?.trim() || DEFAULT_PROMPT;
  const duration = options.duration ?? 6;
  const ratio = options.ratio ?? "1280:720";
  const audio = options.audio ?? false;

  try {
    const body = {
      model: "veo3.1_fast" as const,
      promptText,
      ratio,
      duration,
      audio,
    };
    const task = await client.textToVideo.create(body).waitForTaskOutput();
    return { output: task.output };
  } catch (err) {
    if (err instanceof TaskFailedError) {
      console.error("Generation failed:", err.taskDetails);
      throw new Error(
        `Runway task failed: ${JSON.stringify(err.taskDetails ?? err)}`
      );
    }
    throw err;
  }
}
