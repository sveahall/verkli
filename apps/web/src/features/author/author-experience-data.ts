// Public sample text and recordings already used by the Verkli demo.
// Source: scripts/regenerate-demo-audio-elevenlabs.ts. No live generation.
export const storyLanguages = [
  { code: "en", label: "English", title: "The Haunted Diary", closing: "I tried to close it. The cover refused.", passage: "The first time I opened the diary, it was not my own ink that moved across the page. The words formed slowly, as if someone on the other side of the wall were writing while I watched. I tried to close it. The cover refused." },
  { code: "sv", label: "Svenska", title: "Den hemsökta dagboken", closing: "Jag försökte stänga den. Pärmen vägrade.", passage: "Den första gången jag öppnade dagboken var det inte mitt eget bläck som rörde sig över sidan. Orden formade sig långsamt, som om någon på andra sidan väggen skrev medan jag tittade på. Jag försökte stänga den. Pärmen vägrade." },
  { code: "fr", label: "Français", title: "Le journal hanté", closing: "J’ai essayé de le refermer. La couverture a refusé.", passage: "La première fois que j'ai ouvert le journal, ce n'était pas mon encre qui bougeait sur la page. Les mots se formaient lentement, comme si quelqu'un, de l'autre côté du mur, écrivait pendant que je regardais. J'ai essayé de le refermer. La couverture a refusé." },
  { code: "de", label: "Deutsch", title: "Das verfluchte Tagebuch", closing: "Ich versuchte, es zu schließen. Der Deckel weigerte sich.", passage: "Beim ersten Öffnen des Tagebuchs war es nicht meine eigene Tinte, die über die Seite glitt. Die Wörter bildeten sich langsam, als schriebe jemand auf der anderen Seite der Wand, während ich zusah. Ich versuchte, es zu schließen. Der Deckel weigerte sich." },
] as const;

export type StoryLanguage = (typeof storyLanguages)[number]["code"];

export const writingVersions = {
  original: "I opened the diary. Words appeared on the page, but I was not writing them. I tried to close it. It would not close.",
  vivid: "The first time I opened the diary, it was not my own ink that moved across the page. The words formed slowly, as if someone on the other side of the wall were writing while I watched. I tried to close it. The cover refused.",
  concise: "The diary wrote itself. I tried to close it. The cover refused.",
} as const;

// RMS envelope measured from the committed recordings (56 bins).
export const sampleWaveforms = {"en":{"seconds":12.68,"peaks":[0.285,0.821,0.782,0.965,0.5,0.517,0.543,0.42,0.654,0.925,0.258,0.392,0.364,0.264,0.387,0.358,0.157,0.08,0.08,0.435,1.0,0.301,0.821,0.21,0.757,0.371,0.08,0.08,0.443,0.686,0.774,0.823,0.493,0.668,0.571,0.565,0.431,0.346,0.449,0.376,0.137,0.08,0.08,0.274,0.513,0.246,0.685,0.152,0.08,0.08,0.296,0.741,0.408,0.432,0.098,0.08]},"sv":{"seconds":13.89,"peaks":[0.528,0.711,0.911,0.912,0.518,0.85,0.483,0.457,0.594,0.539,0.419,0.599,0.428,0.266,0.423,0.534,0.361,0.458,0.307,0.08,0.08,0.84,0.858,1.0,0.667,0.973,0.45,0.346,0.491,0.788,0.492,0.583,0.638,0.565,0.366,0.404,0.452,0.457,0.253,0.264,0.288,0.08,0.08,0.26,0.543,0.299,0.64,0.425,0.208,0.08,0.63,0.843,0.737,0.382,0.266,0.08]},"fr":{"seconds":13.98,"peaks":[0.357,0.811,0.546,0.742,0.804,0.593,0.436,0.27,0.563,0.555,0.66,0.237,0.321,0.335,0.35,0.302,0.08,0.08,0.554,0.886,0.671,0.772,0.719,0.406,0.08,0.159,0.519,0.573,0.52,0.662,0.391,0.642,0.711,0.42,0.08,0.574,0.719,0.426,0.473,0.498,0.258,0.08,0.08,0.887,0.682,1.0,0.625,0.585,0.129,0.18,0.533,0.386,0.416,0.277,0.158,0.08]},"de":{"seconds":13.89,"peaks":[0.486,0.569,0.391,0.536,0.287,0.271,0.221,0.241,0.491,0.446,0.364,0.314,0.573,0.199,0.253,0.229,0.197,0.08,0.08,0.08,1.0,0.493,0.95,0.462,0.513,0.446,0.321,0.269,0.487,0.481,0.237,0.34,0.406,0.306,0.46,0.122,0.248,0.309,0.317,0.278,0.08,0.08,0.102,0.633,0.253,0.123,0.408,0.198,0.08,0.08,0.327,0.563,0.442,0.17,0.1,0.08]}} as const;
