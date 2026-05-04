/**
 * Demo book content for the investor pitch.
 *
 * "The Haunted Diary" — short opener, original text written for this demo
 * (so there is no third-party copyright concern when the pitch is recorded).
 * Source language is Swedish (matches the founder's demo narrative). The
 * other 9 entries are translations: 3 A-quality (EN/DE/FR) and 6 B-quality
 * (ES/IT/NL/PT/PL/JA). The B-quality bucket is intentional — per the plan
 * we ship "6 perfect + 6 good", which is more honest than 10 half-baked.
 *
 * Each entry contains:
 *   - language_code: ISO 639-1
 *   - title:         displayed in the reader/author UI per language
 *   - quality:       'A' (perfect) | 'B' (good); used for analytics/badges
 *   - chapterTitle:  per-language chapter heading
 *   - chapterDoc:    TipTap document JSON, stored in chapters.content
 */

export type DemoTranslationQuality = "A" | "B" | "ORIGINAL";

export interface DemoChapterDoc {
  type: "doc";
  content: ReadonlyArray<DemoTipTapNode>;
}

export interface DemoTipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ReadonlyArray<DemoTipTapNode>;
  text?: string;
}

export interface DemoTranslation {
  language_code: string;
  title: string;
  description: string;
  quality: DemoTranslationQuality;
  chapterTitle: string;
  chapterDoc: DemoChapterDoc;
}

function paragraph(text: string): DemoTipTapNode {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function heading(text: string, level = 1): DemoTipTapNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function makeDoc(headingText: string, paragraphs: ReadonlyArray<string>): DemoChapterDoc {
  return {
    type: "doc",
    content: [heading(headingText, 1), ...paragraphs.map(paragraph)],
  };
}

// ─── Source: Swedish ────────────────────────────────────────────────────
const SV_PARAGRAPHS = [
  "Den första gången jag öppnade dagboken var det inte mitt eget bläck som rörde sig över sidan. Orden formade sig långsamt, som om någon på andra sidan väggen skrev medan jag tittade på.",
  "Jag försökte stänga den. Pärmen vägrade. Sidan fylldes till slutet, och nästa sida vände sig själv.",
  "Jag bestämde mig för att läsa till slutet. Det var det enda hederliga att göra mot någon som inte längre kunde tala för sig själv.",
];

// ─── A-quality (perfect) ────────────────────────────────────────────────
const EN_PARAGRAPHS = [
  "The first time I opened the diary, it was not my own ink that moved across the page. The words formed slowly, as if someone on the other side of the wall were writing while I watched.",
  "I tried to close it. The cover refused. The page filled itself to the end, and the next page turned of its own accord.",
  "I decided to read to the last entry. It was the only honest thing to do for someone who could no longer speak for herself.",
];

const DE_PARAGRAPHS = [
  "Beim ersten Öffnen des Tagebuchs war es nicht meine eigene Tinte, die über die Seite glitt. Die Wörter bildeten sich langsam, als schriebe jemand auf der anderen Seite der Wand, während ich zusah.",
  "Ich versuchte, es zu schließen. Der Deckel weigerte sich. Die Seite füllte sich bis zum Ende, und das nächste Blatt wendete sich von selbst.",
  "Ich beschloss, bis zum letzten Eintrag zu lesen. Es war das einzig Anständige gegenüber jemandem, der nicht mehr für sich selbst sprechen konnte.",
];

const FR_PARAGRAPHS = [
  "La première fois que j'ai ouvert le journal, ce n'était pas mon encre qui bougeait sur la page. Les mots se formaient lentement, comme si quelqu'un, de l'autre côté du mur, écrivait pendant que je regardais.",
  "J'ai essayé de le refermer. La couverture a refusé. La page s'est remplie jusqu'à la fin, et la suivante s'est tournée d'elle-même.",
  "J'ai décidé de lire jusqu'à la dernière entrée. C'était la seule chose honnête à faire pour quelqu'un qui ne pouvait plus parler pour lui-même.",
];

// ─── B-quality (good, not perfect) ──────────────────────────────────────
const ES_PARAGRAPHS = [
  "La primera vez que abrí el diario, no era mi propia tinta la que se movía por la página. Las palabras se formaban despacio, como si alguien al otro lado de la pared estuviera escribiendo mientras yo miraba.",
  "Intenté cerrarlo. La tapa se negó. La página se llenó hasta el final, y la siguiente se dio la vuelta sola.",
  "Decidí leer hasta la última entrada. Era lo único honesto que se podía hacer por alguien que ya no podía hablar por sí misma.",
];

const IT_PARAGRAPHS = [
  "La prima volta che aprii il diario, non era il mio inchiostro a muoversi sulla pagina. Le parole si formavano lentamente, come se qualcuno dall'altra parte del muro stesse scrivendo mentre guardavo.",
  "Provai a chiuderlo. La copertina si rifiutò. La pagina si riempì fino in fondo, e quella successiva si girò da sola.",
  "Decisi di leggere fino all'ultima annotazione. Era l'unica cosa onesta da fare per qualcuno che non poteva più parlare da sé.",
];

const NL_PARAGRAPHS = [
  "De eerste keer dat ik het dagboek opende, was het niet mijn eigen inkt die over de bladzijde bewoog. De woorden vormden zich langzaam, alsof iemand aan de andere kant van de muur aan het schrijven was terwijl ik toekeek.",
  "Ik probeerde het te sluiten. De kaft weigerde. De bladzijde vulde zichzelf tot het eind, en de volgende sloeg zichzelf om.",
  "Ik besloot tot de laatste aantekening te lezen. Het was het enige eerlijke wat je kon doen voor iemand die niet meer voor zichzelf kon spreken.",
];

const PT_PARAGRAPHS = [
  "A primeira vez que abri o diário, não era a minha tinta que se movia pela página. As palavras formavam-se devagar, como se alguém do outro lado da parede estivesse a escrever enquanto eu observava.",
  "Tentei fechá-lo. A capa recusou-se. A página encheu-se até ao fim, e a seguinte virou-se sozinha.",
  "Decidi ler até à última entrada. Era a única coisa honesta a fazer por alguém que já não podia falar por si.",
];

const PL_PARAGRAPHS = [
  "Kiedy po raz pierwszy otworzyłam pamiętnik, to nie mój własny atrament poruszał się po stronie. Słowa układały się powoli, jakby ktoś po drugiej stronie ściany pisał, podczas gdy ja patrzyłam.",
  "Próbowałam go zamknąć. Okładka odmówiła. Strona zapełniła się do końca, a następna sama się obróciła.",
  "Postanowiłam czytać do ostatniego wpisu. To była jedyna uczciwa rzecz, jaką mogłam zrobić dla kogoś, kto już nie mógł sam za siebie mówić.",
];

const JA_PARAGRAPHS = [
  "日記を初めて開いたとき、ページの上を動いていたのは私のインクではなかった。誰かが壁の向こうで書いているかのように、文字がゆっくりと現れていった。",
  "閉じようとした。表紙は閉じることを拒んだ。ページは最後まで自ら埋まり、次のページがひとりでにめくられた。",
  "最後の記述まで読むと決めた。もう自分のことを語れなくなった誰かに対して、それが唯一の誠実な行いだった。",
];

const TITLE_BY_LANG: Record<string, string> = {
  sv: "Den hemsökta dagboken",
  en: "The Haunted Diary",
  de: "Das heimgesuchte Tagebuch",
  fr: "Le journal hanté",
  es: "El diario embrujado",
  it: "Il diario infestato",
  nl: "Het spookachtige dagboek",
  pt: "O diário assombrado",
  pl: "Nawiedzony pamiętnik",
  ja: "呪われた日記",
};

const DESCRIPTION_BY_LANG: Record<string, string> = {
  sv: "En kort gotisk berättelse om en dagbok som vägrar tystna.",
  en: "A short gothic tale about a diary that refuses to fall silent.",
  de: "Eine kurze gotische Erzählung über ein Tagebuch, das sich nicht zum Schweigen bringen lässt.",
  fr: "Un court récit gothique sur un journal qui refuse de se taire.",
  es: "Un breve relato gótico sobre un diario que se niega a callar.",
  it: "Un breve racconto gotico su un diario che si rifiuta di tacere.",
  nl: "Een kort gotisch verhaal over een dagboek dat weigert te zwijgen.",
  pt: "Um breve conto gótico sobre um diário que se recusa a calar-se.",
  pl: "Krótka gotycka opowieść o pamiętniku, który nie chce milczeć.",
  ja: "沈黙を拒む日記をめぐる短い怪奇譚。",
};

const CHAPTER_HEADING_BY_LANG: Record<string, string> = {
  sv: "Första anteckningen",
  en: "The First Entry",
  de: "Der erste Eintrag",
  fr: "La première entrée",
  es: "La primera entrada",
  it: "La prima annotazione",
  nl: "De eerste aantekening",
  pt: "A primeira entrada",
  pl: "Pierwszy wpis",
  ja: "最初の記述",
};

interface BuildArgs {
  language_code: string;
  quality: DemoTranslationQuality;
  paragraphs: ReadonlyArray<string>;
}

function build({ language_code, quality, paragraphs }: BuildArgs): DemoTranslation {
  const heading = CHAPTER_HEADING_BY_LANG[language_code];
  return {
    language_code,
    title: TITLE_BY_LANG[language_code],
    description: DESCRIPTION_BY_LANG[language_code],
    quality,
    chapterTitle: heading,
    chapterDoc: makeDoc(heading, paragraphs),
  };
}

export const ORIGINAL_LANGUAGE = "sv" as const;

export const DEMO_TRANSLATIONS: ReadonlyArray<DemoTranslation> = [
  build({ language_code: "sv", quality: "ORIGINAL", paragraphs: SV_PARAGRAPHS }),
  // A-quality
  build({ language_code: "en", quality: "A", paragraphs: EN_PARAGRAPHS }),
  build({ language_code: "de", quality: "A", paragraphs: DE_PARAGRAPHS }),
  build({ language_code: "fr", quality: "A", paragraphs: FR_PARAGRAPHS }),
  // B-quality
  build({ language_code: "es", quality: "B", paragraphs: ES_PARAGRAPHS }),
  build({ language_code: "it", quality: "B", paragraphs: IT_PARAGRAPHS }),
  build({ language_code: "nl", quality: "B", paragraphs: NL_PARAGRAPHS }),
  build({ language_code: "pt", quality: "B", paragraphs: PT_PARAGRAPHS }),
  build({ language_code: "pl", quality: "B", paragraphs: PL_PARAGRAPHS }),
  build({ language_code: "ja", quality: "B", paragraphs: JA_PARAGRAPHS }),
];

export const DEMO_BOOK_SLUG = "the-haunted-diary";
export const DEMO_AUTHOR_EMAIL = "demo-author@verkli.local";
export const DEMO_AUTHOR_USERNAME = "verkli-demo";
export const DEMO_AUTHOR_DISPLAY_NAME = "Astrid Halvorsen";
