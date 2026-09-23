import type { AuthorProfile } from "./types";

export type EvaluationCase = {
  id: string;
  title: string;
  category: string;
  sourceLanguage: string;
  targetLanguage: string;
  texts: string[];
  translations: string[];
  profile: AuthorProfile;
  expectedBlocking: boolean;
  rationale: string;
};

export const EVALUATION_CORPUS_VERSION = "sv-en-v1";

// Original, synthetic excerpts. Labels are provisional developer expectations,
// requiring bilingual human review before use as a quality benchmark.
// IDs, titles, categories, expectedBlocking and rationales are human/evaluation
// metadata: never include them in model input.
const negation = {
  title: "The unopened letter",
  category: "negation",
  sourceLanguage: "sv",
  targetLanguage: "en",
  texts: ["Jag öppnade inte brevet.", "Det låg kvar bredvid saltet."],
  profile: {
    voice: "Restrained first-person narration with ordinary domestic details.",
    rhythm: "Two short declarative sentences.",
    dialogue: "No dialogue in this excerpt.",
    preserve: ["Plain vocabulary", "First-person perspective"],
    glossary: [],
  },
};

const omissionAgency = {
  title: "The key under the cup",
  category: "omission-agency",
  sourceLanguage: "en",
  targetLanguage: "sv",
  texts: ["Mara put the key under the blue cup because I asked her to.", "I waited by the door."],
  profile: {
    voice: "Matter-of-fact first-person narration of a small domestic action.",
    rhythm: "A longer sentence followed by a short sentence.",
    dialogue: "No direct dialogue in this excerpt.",
    preserve: ["Plain descriptions", "Proper names"],
    glossary: [],
  },
};

const repetitionFragments = {
  title: "Three measured steps",
  category: "repetition-fragments",
  sourceLanguage: "sv",
  targetLanguage: "en",
  texts: ["Ett steg. Ett steg. Ett steg.", "Sedan stilla. Alldeles stilla."],
  profile: {
    voice: "Spare observation of movement and stillness.",
    rhythm: "Short fragments, repeated words and full stops create a measured beat.",
    dialogue: "No dialogue in this excerpt.",
    preserve: ["Deliberate repetition", "Sentence fragments"],
    glossary: [],
  },
};

const dialogueRegister = {
  title: "Liv's request",
  category: "dialogue-register",
  sourceLanguage: "en",
  targetLanguage: "sv",
  texts: ["“Gimme the bag. Yeah, that one,” Liv said.", "I nudged it with my foot."],
  profile: {
    voice: "Casual first-person scene with a small physical gesture.",
    rhythm: "Brief spoken phrases followed by a short narrative sentence.",
    dialogue: "Everyday, colloquial speech with compressed pronunciation.",
    preserve: ["Informal dialogue", "Simple speech attribution"],
    glossary: [],
  },
};

const termConsistency = {
  title: "The memory stone",
  category: "term-consistency",
  sourceLanguage: "sv",
  targetLanguage: "en",
  texts: ["En minnessten låg på bordet.", "Jag lade minnesstenen i fickan."],
  profile: {
    voice: "Plain first-person narration treating a named object as familiar.",
    rhythm: "Two short sentences describing an object and an action.",
    dialogue: "No dialogue in this excerpt.",
    preserve: ["Concrete physical details", "Plain syntax"],
    glossary: [{ source: "minnessten", target: "memory stone" }],
  },
};

export const EVALUATION_CASES: EvaluationCase[] = [
  {
    ...negation,
    id: "negation-clean",
    translations: ["I did not open the letter.", "It was still lying beside the salt."],
    expectedBlocking: false,
    rationale: "Preserves the negated action, remaining location and restrained first-person voice.",
  },
  {
    ...negation,
    id: "negation-defect",
    translations: ["I opened the letter.", "It was still lying beside the salt."],
    expectedBlocking: true,
    rationale: "Fidelity: removing 'inte' reverses whether the narrator opened the letter; only segment 0 changes.",
  },
  {
    ...omissionAgency,
    id: "omission-agency-clean",
    translations: ["Mara lade nyckeln under den blå koppen eftersom jag bad henne.", "Jag väntade vid dörren."],
    expectedBlocking: false,
    rationale: "Preserves Mara's action, the narrator's request as its cause and the waiting narrator.",
  },
  {
    ...omissionAgency,
    id: "omission-agency-defect",
    translations: ["Mara lade nyckeln under den blå koppen.", "Jag väntade vid dörren."],
    expectedBlocking: true,
    rationale: "Fidelity: one omitted causal clause removes the narrator's role in initiating Mara's action; quote surviving target text to anchor the omission.",
  },
  {
    ...repetitionFragments,
    id: "repetition-fragments-clean",
    translations: ["One step. One step. One step.", "Then still. Completely still."],
    expectedBlocking: false,
    rationale: "Preserves the repeated beats and deliberate fragments; their roughness is not a fluency error.",
  },
  {
    ...repetitionFragments,
    id: "repetition-fragments-defect",
    translations: ["Three steps.", "Then still. Completely still."],
    expectedBlocking: true,
    rationale: "Style: summarising three separate repeated beats as 'Three steps.' removes the central rhythmic effect while retaining the step count.",
  },
  {
    ...dialogueRegister,
    id: "dialogue-register-clean",
    translations: ["”Ge mig väskan. Ja, den där”, sa Liv.", "Jag knuffade till den med foten."],
    expectedBlocking: false,
    rationale: "Natural informal Swedish preserves the direct request and conversational confirmation without forcing an English pronunciation spelling into Swedish.",
  },
  {
    ...dialogueRegister,
    id: "dialogue-register-defect",
    translations: ["”Överlämna väskan till mig. Ja, det åsyftade exemplaret”, sa Liv.", "Jag knuffade till den med foten."],
    expectedBlocking: true,
    rationale: "Style: the same request and confirmation acquire a conspicuously bureaucratic register in place of Liv's casual speech; narration stays identical.",
  },
  {
    ...termConsistency,
    id: "term-consistency-clean",
    translations: ["A memory stone lay on the table.", "I put the memory stone in my pocket."],
    expectedBlocking: false,
    rationale: "Keeps the same stone across both segments and follows the source-grounded glossary.",
  },
  {
    ...termConsistency,
    id: "term-consistency-defect",
    translations: ["A memory stone lay on the table.", "I put the memory coin in my pocket."],
    expectedBlocking: true,
    rationale: "Fidelity: 'memory coin' replaces the recurring 'memory stone' in segment 1, changing the object and breaking the glossary across segments.",
  },
];
