export type RecoveryItem = {
  id: string;
  kind: "book" | "chapter";
  title: string;
  bookTitle: string;
  edition: string;
  deletedAt: string;
  revision: number;
  preview: string;
};

/** The server must authenticate the owner and compare the revision atomically. */
export type RecoveryAdapter = {
  list: () => Promise<RecoveryItem[]>;
  restore: (expected: RecoveryItem) => Promise<void>;
};
