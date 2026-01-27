import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_PROMPT =
  "A cinematic 5-second shot, handheld, shallow depth of field";

(async () => {
  const { makeVideo } = await import("./textToVideo");
  const opts: Record<string, unknown> = {};
  opts.promptText = process.env.RUNWAY_PROMPT_TEXT || DEFAULT_PROMPT;
  if (process.env.RUNWAY_DURATION) {
    const n = parseInt(process.env.RUNWAY_DURATION, 10);
    if ([4, 6, 8].includes(n)) opts.duration = n as 4 | 6 | 8;
  }
  const ratios = ["1280:720", "720:1280", "1080:1920", "1920:1080"] as const;
  const rEnv = process.env.RUNWAY_RATIO;
  if (rEnv && (ratios as readonly string[]).includes(rEnv)) opts.ratio = rEnv as (typeof ratios)[number];
  if (process.env.RUNWAY_AUDIO === "1" || process.env.RUNWAY_AUDIO === "true") opts.audio = true;
  try {
    const r = await makeVideo(opts as import("./textToVideo").TextToVideoOptions);
    const urls = Array.isArray(r?.output) ? r.output : [];
    if (urls.length) {
      console.log("Done. Video(s) – öppna i webbläsare eller ladda ner:\n");
      urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
      console.log("\n(OBS: länkarna går ut efter en tid.)");
    } else {
      console.log("Done:", r);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
