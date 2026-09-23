import type { BookAnalysisReport } from "@/lib/editorial/book-analysis-schema";
export const bookId = "11111111-1111-4111-8111-111111111111";
export const versionId = "22222222-2222-4222-8222-222222222222";
export const fixtureChapters = [
  { id: "33333333-3333-4333-8333-333333333331", title: "The promise", order: 0, book_version_id: versionId,
    content: "On Monday, Mira promised to meet Elias at the harbour two days later. Elias had never left the island. His eyes were grey. I knew only what Mira chose to tell me." },
  { id: "33333333-3333-4333-8333-333333333332", title: "The crossing", order: 1, book_version_id: versionId,
    content: "On Tuesday, exactly two days after the promise, Mira reached the harbour. Elias spoke of his years living in Paris. His eyes were green. She boarded the last ferry to keep her promise." },
  { id: "33333333-3333-4333-8333-333333333333", title: "The letter", order: 2, book_version_id: versionId,
    content: "I watched Mira open the letter. Without speaking, she remembered the secret she had never told anyone. The ferry had already left, but Elias still waited beside its gangway." },
];
export const fixtureReport: BookAnalysisReport = {
  summary: "The promise gives the crossing a clear purpose. Three details need a closer look across the manuscript: the elapsed days, Elias’s history, and the narrator’s access to Mira’s thoughts.",
  areas: [
    { category: "plot", summary: "Mira’s promise motivates the journey. Clarify the final position of the ferry and its gangway." },
    { category: "timeline", summary: "The meeting is described as two days after Monday, but the next chapter calls that day Tuesday." },
    { category: "perspective", summary: "The narrator begins with limited knowledge but later reports an unspoken memory." },
    { category: "characters", summary: "Elias’s travel history and eye colour differ between the opening chapters." },
  ],
  findings: [
    { category: "timeline", severity: "important", title: "One day or two after the promise?", explanation: "Monday to Tuesday is one day. Check whether the meeting should be Wednesday or the stated delay should be one day.", evidence: [
      { chapterId: fixtureChapters[0].id, quote: "On Monday, Mira promised to meet Elias at the harbour two days later." },
      { chapterId: fixtureChapters[1].id, quote: "On Tuesday, exactly two days after the promise, Mira reached the harbour." },
    ] },
    { category: "characters", severity: "important", title: "Elias has two different histories", explanation: "The opening says Elias has never left the island, while the next chapter gives him years in Paris. If this is a deliberate revelation, signal why the first account was incomplete.", evidence: [
      { chapterId: fixtureChapters[0].id, quote: "Elias had never left the island." },
      { chapterId: fixtureChapters[1].id, quote: "Elias spoke of his years living in Paris." },
    ] },
    { category: "perspective", severity: "suggestion", title: "How does the narrator know the secret?", explanation: "The stated limits of the narrator’s knowledge conflict with the later unspoken memory. Consider a cue that explains the shift in perspective.", evidence: [
      { chapterId: fixtureChapters[0].id, quote: "I knew only what Mira chose to tell me." },
      { chapterId: fixtureChapters[2].id, quote: "Without speaking, she remembered the secret she had never told anyone." },
    ] },
  ],
};
