export type BookWorkspaceChapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

export type InlineAiAction =
  | "rewrite"
  | "pacing"
  | "expand"
  | "audiobook"
  | "translate";

export type WriteInlineAiEventDetail = {
  action: InlineAiAction;
  selectedText: string;
};

export const WRITE_INLINE_AI_EVENT = "verkli:write-inline-ai";
