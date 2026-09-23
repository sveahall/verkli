/**
 * Regenerate the 10 demo audiobook snippets via ElevenLabs.
 *
 * Replaces the macOS `say`-generated MP3s with real ElevenLabs voice across
 * all 10 demo languages, using a single voice cloned from the team's
 * ELEVENLABS_VOICE_ID. Same voice across every language → consistent demo.
 *
 * Output: apps/web/public/demo-assets/audio/<lang>.mp3 (one per language)
 *
 * Pipeline: ElevenLabsTtsProvider (eleven_multilingual_v2,
 * mp3_44100_128 by default) → file system. Same provider class the
 * audiobook worker uses in production, so the demo audio renders against
 * the same code path that ships.
 *
 * Cost: ~250 chars × 10 languages = ~2 500 chars per full regen. On
 * Creator/Pro plans this is trivial; on free trial this is ~25% of the
 * monthly quota.
 *
 * Idempotent: regenerates the .mp3 files on every run.
 */

import "./load-dotenv";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsTtsProvider } from "../src/lib/tts/elevenlabs-tts-provider";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const OUT_DIR = path.join(PUBLIC_DIR, "demo-assets", "audio");

interface VoiceText {
  language_code: string;
  /** ISO 639-1 mapped to the BCP-47-style hint ElevenLabs accepts. */
  language: string;
  text: string;
}

// First two paragraphs of "The Haunted Diary" per language. Same source
// strings as the legacy `say`-based generator. Kept ~20-25 s when spoken.
const VOICES: ReadonlyArray<VoiceText> = [
  {
    language_code: "sv",
    language: "sv",
    text: "Den första gången jag öppnade dagboken var det inte mitt eget bläck som rörde sig över sidan. Orden formade sig långsamt, som om någon på andra sidan väggen skrev medan jag tittade på. Jag försökte stänga den. Pärmen vägrade.",
  },
  {
    language_code: "en",
    language: "en",
    text: "The first time I opened the diary, it was not my own ink that moved across the page. The words formed slowly, as if someone on the other side of the wall were writing while I watched. I tried to close it. The cover refused.",
  },
  {
    language_code: "de",
    language: "de",
    text: "Beim ersten Öffnen des Tagebuchs war es nicht meine eigene Tinte, die über die Seite glitt. Die Wörter bildeten sich langsam, als schriebe jemand auf der anderen Seite der Wand, während ich zusah. Ich versuchte, es zu schließen. Der Deckel weigerte sich.",
  },
  {
    language_code: "fr",
    language: "fr",
    text: "La première fois que j'ai ouvert le journal, ce n'était pas mon encre qui bougeait sur la page. Les mots se formaient lentement, comme si quelqu'un, de l'autre côté du mur, écrivait pendant que je regardais. J'ai essayé de le refermer. La couverture a refusé.",
  },
  {
    language_code: "es",
    language: "es",
    text: "La primera vez que abrí el diario, no era mi propia tinta la que se movía por la página. Las palabras se formaban despacio, como si alguien al otro lado de la pared estuviera escribiendo mientras yo miraba. Intenté cerrarlo. La tapa se negó.",
  },
  {
    language_code: "it",
    language: "it",
    text: "La prima volta che aprii il diario, non era il mio inchiostro a muoversi sulla pagina. Le parole si formavano lentamente, come se qualcuno dall'altra parte del muro stesse scrivendo mentre guardavo. Provai a chiuderlo. La copertina si rifiutò.",
  },
  {
    language_code: "nl",
    language: "nl",
    text: "De eerste keer dat ik het dagboek opende, was het niet mijn eigen inkt die over de bladzijde bewoog. De woorden vormden zich langzaam, alsof iemand aan de andere kant van de muur aan het schrijven was terwijl ik toekeek. Ik probeerde het te sluiten. De kaft weigerde.",
  },
  {
    language_code: "pt",
    language: "pt",
    text: "A primeira vez que abri o diário, não era a minha tinta que se movia pela página. As palavras formavam-se devagar, como se alguém do outro lado da parede estivesse a escrever enquanto eu observava. Tentei fechá-lo. A capa recusou-se.",
  },
  {
    language_code: "pl",
    language: "pl",
    text: "Kiedy po raz pierwszy otworzyłam pamiętnik, to nie mój własny atrament poruszał się po stronie. Słowa układały się powoli, jakby ktoś po drugiej stronie ściany pisał, podczas gdy ja patrzyłam. Próbowałam go zamknąć. Okładka odmówiła.",
  },
  {
    language_code: "ja",
    language: "ja",
    text: "日記を初めて開いたとき、ページの上を動いていたのは私のインクではなかった。誰かが壁の向こうで書いているかのように、文字がゆっくりと現れていった。閉じようとした。表紙は閉じることを拒んだ。",
  },
];

const SYNTHESIS_TIMEOUT_MS = 60_000;

interface GeneratedAudio {
  language_code: string;
  relative_url: string;
  bytes: number;
}

async function main(): Promise<void> {
  const apiKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is required");

  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const provider = new ElevenLabsTtsProvider();
  const results: GeneratedAudio[] = [];
  for (const v of VOICES) {
    const out = await provider.synthesize(v.text, {
      language: v.language,
      voiceId: "", // empty → provider falls back to ELEVENLABS_VOICE_ID env
      modelId: "", // empty → provider falls back to env or eleven_multilingual_v2
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
    });
    if (out.format !== "mp3") {
      throw new Error(
        `Expected mp3 output but got ${out.format}. Set ELEVENLABS_OUTPUT_FORMAT to mp3_44100_128 or similar.`
      );
    }
    const filepath = path.join(OUT_DIR, `${v.language_code}.mp3`);
    writeFileSync(filepath, out.wav);
    results.push({
      language_code: v.language_code,
      relative_url: `/demo-assets/audio/${v.language_code}.mp3`,
      bytes: out.wav.byteLength,
    });
    console.log(
      `[demo-audio] [${v.language_code}] ${(out.wav.byteLength / 1024).toFixed(1)} KB → ${v.language_code}.mp3 (${out.metadata.model})`
    );
  }
  const totalKB = results.reduce((s, r) => s + r.bytes, 0) / 1024;
  console.log(
    `\n[demo-audio] Done. ${results.length} files, ${totalKB.toFixed(1)} KB total in ${OUT_DIR}`
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[demo-audio] Failed:", message);
  process.exit(1);
});
