/**
 * Generate the 10 demo audiobook snippets used by the investor pitch.
 *
 * Output: apps/web/public/demo-assets/audio/<lang>.mp3 (one per language)
 *
 * Pipeline: macOS `say` → AIFF → ffmpeg-static → MP3 (mono, 96 kbps).
 *
 * Notes:
 *   - macOS native voices are used as a *placeholder*. Voice consistency
 *     across 10 languages with `say` is not possible (each language has its
 *     own native voice). For the recorded pitch, swap to ElevenLabs
 *     Multilingual or Qwen3 with a single voice profile by replacing the
 *     `mp3` file. The seed and UI consume only file URLs, not the producer.
 *   - Idempotent: regenerates the .mp3 files on every run.
 *   - macOS-only — requires `say` and ffmpeg.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const OUT_DIR = path.join(PUBLIC_DIR, "demo-assets", "audio");

interface VoiceSpec {
  language_code: string;
  voice: string;
  text: string;
}

// First two paragraphs of "The Haunted Diary" per language. Kept short
// (~20–25 s when spoken at default rate) to match the demo timing budget.
const VOICES: ReadonlyArray<VoiceSpec> = [
  {
    language_code: "sv",
    voice: "Alva",
    text: "Den första gången jag öppnade dagboken var det inte mitt eget bläck som rörde sig över sidan. Orden formade sig långsamt, som om någon på andra sidan väggen skrev medan jag tittade på. Jag försökte stänga den. Pärmen vägrade.",
  },
  {
    language_code: "en",
    voice: "Samantha",
    text: "The first time I opened the diary, it was not my own ink that moved across the page. The words formed slowly, as if someone on the other side of the wall were writing while I watched. I tried to close it. The cover refused.",
  },
  {
    language_code: "de",
    voice: "Anna",
    text: "Beim ersten Öffnen des Tagebuchs war es nicht meine eigene Tinte, die über die Seite glitt. Die Wörter bildeten sich langsam, als schriebe jemand auf der anderen Seite der Wand, während ich zusah. Ich versuchte, es zu schließen. Der Deckel weigerte sich.",
  },
  {
    language_code: "fr",
    voice: "Thomas",
    text: "La première fois que j'ai ouvert le journal, ce n'était pas mon encre qui bougeait sur la page. Les mots se formaient lentement, comme si quelqu'un, de l'autre côté du mur, écrivait pendant que je regardais. J'ai essayé de le refermer. La couverture a refusé.",
  },
  {
    language_code: "es",
    voice: "Mónica",
    text: "La primera vez que abrí el diario, no era mi propia tinta la que se movía por la página. Las palabras se formaban despacio, como si alguien al otro lado de la pared estuviera escribiendo mientras yo miraba. Intenté cerrarlo. La tapa se negó.",
  },
  {
    language_code: "it",
    voice: "Alice",
    text: "La prima volta che aprii il diario, non era il mio inchiostro a muoversi sulla pagina. Le parole si formavano lentamente, come se qualcuno dall'altra parte del muro stesse scrivendo mentre guardavo. Provai a chiuderlo. La copertina si rifiutò.",
  },
  {
    language_code: "nl",
    voice: "Xander",
    text: "De eerste keer dat ik het dagboek opende, was het niet mijn eigen inkt die over de bladzijde bewoog. De woorden vormden zich langzaam, alsof iemand aan de andere kant van de muur aan het schrijven was terwijl ik toekeek. Ik probeerde het te sluiten. De kaft weigerde.",
  },
  {
    language_code: "pt",
    voice: "Joana",
    text: "A primeira vez que abri o diário, não era a minha tinta que se movia pela página. As palavras formavam-se devagar, como se alguém do outro lado da parede estivesse a escrever enquanto eu observava. Tentei fechá-lo. A capa recusou-se.",
  },
  {
    language_code: "pl",
    voice: "Zosia",
    text: "Kiedy po raz pierwszy otworzyłam pamiętnik, to nie mój własny atrament poruszał się po stronie. Słowa układały się powoli, jakby ktoś po drugiej stronie ściany pisał, podczas gdy ja patrzyłam. Próbowałam go zamknąć. Okładka odmówiła.",
  },
  {
    language_code: "ja",
    voice: "Kyoko",
    text: "日記を初めて開いたとき、ページの上を動いていたのは私のインクではなかった。誰かが壁の向こうで書いているかのように、文字がゆっくりと現れていった。閉じようとした。表紙は閉じることを拒んだ。",
  },
];

interface GeneratedAudio {
  language_code: string;
  relative_url: string;
  voice: string;
}

function ensureFfmpeg(): string {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) {
    throw new Error(
      "ffmpeg-static did not resolve a binary path. Reinstall node_modules."
    );
  }
  return bin;
}

function synthesize(spec: VoiceSpec, ffmpeg: string): GeneratedAudio {
  const aiff = path.join(OUT_DIR, `${spec.language_code}.aiff`);
  const mp3 = path.join(OUT_DIR, `${spec.language_code}.mp3`);

  // 1) say → AIFF (default 22050 Hz mono)
  execFileSync("say", ["-v", spec.voice, "-o", aiff, spec.text], {
    stdio: "pipe",
  });

  // 2) ffmpeg → mono 96 kbps MP3
  execFileSync(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      aiff,
      "-ac",
      "1",
      "-b:a",
      "96k",
      "-codec:a",
      "libmp3lame",
      mp3,
    ],
    { stdio: "pipe" }
  );

  rmSync(aiff, { force: true });

  return {
    language_code: spec.language_code,
    relative_url: `/demo-assets/audio/${spec.language_code}.mp3`,
    voice: spec.voice,
  };
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(
      "generate-demo-audio.ts requires macOS for the `say` command. Run on a developer Mac."
    );
  }
  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const ffmpeg = ensureFfmpeg();
  const results: GeneratedAudio[] = [];
  for (const spec of VOICES) {
    const r = synthesize(spec, ffmpeg);
    console.log(`[demo-audio] [${r.language_code}] (${r.voice}) → ${r.relative_url}`);
    results.push(r);
  }
  console.log(`\n[demo-audio] Done. ${results.length} files in ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[demo-audio] Failed:", message);
  process.exit(1);
});
