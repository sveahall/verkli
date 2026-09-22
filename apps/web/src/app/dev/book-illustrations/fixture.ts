import type { IllustrationAdapter, IllustrationChapter, IllustrationProfile } from "@/features/book-illustrations/contracts";

export function createIllustrationFixture() {
  const chapters: IllustrationChapter[] = [
    { id: "harbour", revision: "1", title: "The harbour", excerpt: "Mara reached the harbour as the first fishing boats returned. She waited beside the old blue door.", illustration: null },
    { id: "island", revision: "1", title: "The island", excerpt: "Beyond the last buoy, the island appeared through the mist. The path led between the pines.", illustration: null },
  ];
  const profiles: IllustrationProfile[] = [
    { id: "ink", revision: "1", name: "Ink & sea", medium: "Ink drawing", palette: "Navy, sea green, warm paper" },
    { id: "watercolour", revision: "1", name: "Quiet watercolour", medium: "Watercolour", palette: "Slate blue, moss green, cream" },
  ];
  let failure = false;
  let revision = 0;
  const adapter: IllustrationAdapter = {
    snapshot: () => ({ contextId: "synthetic-book", chapters: chapters.map((chapter) => ({ ...chapter, illustration: chapter.illustration ? { ...chapter.illustration, profile: { ...chapter.illustration.profile } } : null })), profiles: profiles.map((profile) => ({ ...profile })) }),
    approve: async (input) => {
      if (failure) throw new Error("Synthetic approval failure. The original preview was kept.");
      const chapter = chapters.find((entry) => entry.id === input.chapterId);
      const profile = profiles.find((entry) => entry.id === input.profileId);
      if (!chapter || !profile) throw new Error("This chapter or style profile is not available.");
      if (chapter.revision !== input.expectedChapterRevision || profile.revision !== input.expectedProfileRevision || (chapter.illustration?.revision ?? null) !== input.expectedIllustrationRevision) throw new Error("The chapter, style or approved image changed. Review the latest version.");
      if (!input.alt.trim() || input.alt.length > 500) throw new Error("Add alternative text of up to 500 characters.");
      if (!["icon", "half-page", "full-page"].includes(input.placement) || ![input.width, input.height].every((value) => Number.isInteger(value) && value > 0)) throw new Error("The image or placement is invalid.");
      const approved = { file: input.file, width: input.width, height: input.height, alt: input.alt.trim(), placement: input.placement, profile: { ...profile }, revision: String(++revision) };
      chapter.illustration = approved;
      return { ...approved, profile: { ...approved.profile } };
    },
  };
  return { adapter, setFailure: (value: boolean) => { failure = value; }, changeChapter: () => { chapters[0].revision = String(Number(chapters[0].revision) + 1); } };
}
