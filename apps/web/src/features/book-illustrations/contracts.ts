export type IllustrationPlacement = "icon" | "half-page" | "full-page";
export type IllustrationProfile = { id: string; revision: string; name: string; medium: string; palette: string };
export type IllustrationImage = { file: File; width: number; height: number };
export type ApprovedIllustration = IllustrationImage & {
  revision: string;
  alt: string;
  placement: IllustrationPlacement;
  profile: IllustrationProfile;
};
export type IllustrationChapter = { id: string; revision: string; title: string; excerpt: string; illustration: ApprovedIllustration | null };
export type IllustrationSnapshot = { contextId: string; chapters: IllustrationChapter[]; profiles: IllustrationProfile[] };
export type IllustrationApproval = IllustrationImage & {
  chapterId: string;
  expectedChapterRevision: string;
  expectedIllustrationRevision: string | null;
  profileId: string;
  expectedProfileRevision: string;
  alt: string;
  placement: IllustrationPlacement;
};
// The adapter owns approved File objects, never object URLs. The panel owns and
// releases preview URLs. Snapshot contextId changes when the book/account changes.
export type IllustrationAdapter = {
  snapshot(): IllustrationSnapshot;
  approve(input: IllustrationApproval): Promise<ApprovedIllustration>;
};
export type LocalIllustrationImage = IllustrationImage & { url: string; dispose(): void };
export type IllustrationImageLoader = (file: File, signal?: AbortSignal) => Promise<LocalIllustrationImage>;
