export type OfflineManifestChapter = {
  id: string;
  title: string;
  order: number;
  contentHash: string;
  readerUrl: string;
};

export type OfflineManifestResponse = {
  bookId: string;
  bookVersionId: string;
  languageCode: string;
  manifestHash: string;
  generatedAt: string;
  chapterBatchUrl: string;
  bookUrl: string;
  chapters: OfflineManifestChapter[];
};

export type OfflineChapterPayload = {
  id: string;
  title: string;
  order: number;
  content: string;
  contentHash: string;
  updatedAt: string | null;
  readerUrl: string;
};

export type OfflineChaptersResponse = {
  bookId: string;
  bookVersionId: string;
  chapters: OfflineChapterPayload[];
};
