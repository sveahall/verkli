// API response types

export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  error: string;
  message: string;
  success: false;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// Book DTOs
export interface BookSummary {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
  authorName: string;
  status: string;
  createdAt: string;
}

export interface BookDetail extends BookSummary {
  description: string | null;
  chapterCount: number;
  publishedAt: string | null;
}

// Chapter DTOs
export interface ChapterSummary {
  id: string;
  title: string;
  order: number;
}

export interface ChapterDetail extends ChapterSummary {
  content: string;
  bookId: string;
}
