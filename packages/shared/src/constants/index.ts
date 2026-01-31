export const APP_NAME = "verkli";

export const USER_ROLES = {
  READER: "READER",
  AUTHOR: "AUTHOR",
  ADMIN: "ADMIN",
} as const;

export const BOOK_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;

export const MAX_CHAPTER_LENGTH = 50000;
export const MAX_BOOK_TITLE_LENGTH = 200;
export const MAX_BOOK_DESCRIPTION_LENGTH = 2000;
