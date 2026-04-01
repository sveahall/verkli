import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfilesByUserIds } from "@/lib/profiles/service";
import { bookExists } from "@/lib/books/service";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_COMMENT_CREATE_FAILED,
  E_COMMENT_LOAD_FAILED,
  E_COMMENT_PARENT_MISMATCH,
  E_COMMENT_PARENT_NOT_FOUND,
  E_COMMENT_THREAD_DEPTH_EXCEEDED,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_INVALID_CHAPTER_ID,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { createNotification } from "@/lib/notifications/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const commentLimiter = createPerUserRateLimiter({ maxPerMinute: 10 });

const paramsSchema = z.object({
  id: z.string().uuid("Invalid book ID"),
});

const postBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  chapterId: z.string().uuid().nullable().optional(),
  parentCommentId: z.string().uuid().nullable().optional(),
});

type CommentRow = {
  id: string;
  book_id: string;
  chapter_id: string | null;
  author_id: string;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type ChapterRow = {
  id: string;
  title: string;
};

function mapAuthor(profile: ProfileRow | null | undefined, fallbackId: string) {
  const displayName = profile?.display_name?.trim();
  const username = profile?.username?.trim();

  return {
    id: fallbackId,
    name: displayName || username || "Reader",
    username: username || null,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

function mapComment(
  row: CommentRow,
  profilesByUserId: Map<string, ProfileRow>,
  chapterTitles: Map<string, string>,
  repliesByParent: Map<string, CommentRow[]>
) {
  const replies = repliesByParent.get(row.id) ?? [];

  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_id ? (chapterTitles.get(row.chapter_id) ?? null) : null,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    authorId: row.author_id,
    createdAt: row.created_at,
    author: mapAuthor(profilesByUserId.get(row.author_id), row.author_id),
    replies: replies.map((reply) => ({
      id: reply.id,
      bookId: reply.book_id,
      chapterId: reply.chapter_id,
      chapterTitle: reply.chapter_id ? (chapterTitles.get(reply.chapter_id) ?? null) : null,
      parentCommentId: reply.parent_comment_id,
      body: reply.body,
      authorId: reply.author_id,
      createdAt: reply.created_at,
      author: mapAuthor(profilesByUserId.get(reply.author_id), reply.author_id),
    })),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const bookId = parsedParams.data.id;
  const url = new URL(request.url);
  const chapterIdFromQuery = url.searchParams.get("chapterId");
  const chapterId =
    chapterIdFromQuery == null || chapterIdFromQuery === "" ? null : chapterIdFromQuery;

  if (chapterId && !z.string().uuid().safeParse(chapterId).success) {
    return apiError(E_INVALID_CHAPTER_ID, 400);
  }

  const supabase = await createClient();
  let query = supabase
    .from("comments")
    .select("id, book_id, chapter_id, author_id, body, parent_comment_id, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (chapterId) {
    query = query.eq("chapter_id", chapterId);
  }

  const [
    { data: comments, error: commentsError },
    {
      data: { user },
    },
  ] = await Promise.all([query, supabase.auth.getUser()]);

  if (commentsError) {
    console.error("[comments] load failed", {
      bookId,
      chapterId,
      message: commentsError.message,
      code: commentsError.code,
    });
    return apiError(E_COMMENT_LOAD_FAILED, 500);
  }

  const rows = (comments ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id)));
  const chapterIds = Array.from(
    new Set(rows.map((row) => row.chapter_id).filter((id): id is string => Boolean(id)))
  );

  const [profilesByUserId, { data: chapters, error: chaptersError }] =
    await Promise.all([
      getProfilesByUserIds(supabase, authorIds, "user_id, display_name, username, avatar_url")
        .then((map) => {
          const result = new Map<string, ProfileRow>();
          for (const [k, v] of map) result.set(k, v as unknown as ProfileRow);
          return result;
        }),
      chapterIds.length > 0
        ? supabase.from("chapters").select("id, title").in("id", chapterIds)
        : Promise.resolve({ data: [] as ChapterRow[], error: null }),
    ]);

  if (chaptersError) {
    console.error("[comments] chapter load failed", {
      bookId,
      chaptersError: chaptersError?.message ?? null,
    });
    return apiError(E_COMMENT_LOAD_FAILED, 500);
  }
  const chapterTitles = new Map(
    ((chapters ?? []) as ChapterRow[]).map((chapter) => [chapter.id, chapter.title] as const)
  );

  const repliesByParent = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.parent_comment_id) continue;
    const existing = repliesByParent.get(row.parent_comment_id) ?? [];
    existing.push(row);
    repliesByParent.set(row.parent_comment_id, existing);
  }

  const topLevelComments = rows.filter((row) => row.parent_comment_id === null);

  return NextResponse.json({
    ok: true,
    data: {
      comments: topLevelComments.map((row) =>
        mapComment(row, profilesByUserId, chapterTitles, repliesByParent)
      ),
      viewerId: user?.id ?? null,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const bookId = parsedParams.data.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // C4: Rate limit comment creation
  const rl = await commentLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = postBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  // C2: Strip HTML tags to prevent stored XSS
  const content = parsedBody.data.body.trim().replace(/<[^>]*>/g, "");
  const chapterId = parsedBody.data.chapterId ?? null;
  const parentCommentId = parsedBody.data.parentCommentId ?? null;

  const existsResult = await bookExists(supabase, bookId);
  if (!existsResult.ok) {
    return apiError(
      existsResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      existsResult.error === "book_not_found" ? 404 : 500,
    );
  }

  if (chapterId) {
    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id, book_id")
      .eq("id", chapterId)
      .maybeSingle();

    if (chapterError) {
      console.error("[comments] chapter lookup failed", {
        bookId,
        chapterId,
        userId: user.id,
        message: chapterError.message,
        code: chapterError.code,
      });
      return apiError(E_COMMENT_CREATE_FAILED, 500);
    }

    if (!chapter || chapter.book_id !== bookId) {
      return apiError(E_INVALID_CHAPTER_ID, 400);
    }
  }

  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("comments")
      .select("id, book_id, chapter_id, parent_comment_id")
      .eq("id", parentCommentId)
      .maybeSingle();

    if (parentError) {
      console.error("[comments] parent lookup failed", {
        bookId,
        parentCommentId,
        userId: user.id,
        message: parentError.message,
        code: parentError.code,
      });
      return apiError(E_COMMENT_CREATE_FAILED, 500);
    }

    if (!parent) {
      return apiError(E_COMMENT_PARENT_NOT_FOUND, 404);
    }

    if (parent.parent_comment_id) {
      return apiError(E_COMMENT_THREAD_DEPTH_EXCEEDED, 400);
    }

    const parentChapterId = parent.chapter_id ?? null;
    if (parent.book_id !== bookId || parentChapterId !== chapterId) {
      return apiError(E_COMMENT_PARENT_MISMATCH, 400);
    }
  }

  const { data: insertedComment, error: insertError } = await supabase
    .from("comments")
    .insert({
      book_id: bookId,
      chapter_id: chapterId,
      author_id: user.id,
      parent_comment_id: parentCommentId,
      body: content,
    })
    .select("id, book_id, chapter_id, author_id, body, parent_comment_id, created_at")
    .single();

  if (insertError) {
    console.error("[comments] create failed", {
      bookId,
      chapterId,
      parentCommentId,
      userId: user.id,
      message: insertError.message,
      code: insertError.code,
    });
    return apiError(E_COMMENT_CREATE_FAILED, 500);
  }

  // Notify parent comment author on reply
  if (parentCommentId && insertedComment) {
    try {
      const { data: parentComment } = await supabase
        .from("comments")
        .select("author_id")
        .eq("id", parentCommentId)
        .maybeSingle();

      if (parentComment && parentComment.author_id !== user.id) {
        await createNotification(supabase, {
          userId: parentComment.author_id,
          type: "comment_reply",
          title: "Svar på din kommentar",
          body: content.slice(0, 120),
          actorId: user.id,
          entityId: insertedComment.id,
          entityType: "comment",
        });
      }
    } catch {
      // non-critical — don't fail the comment
    }
  }

  return NextResponse.json({ ok: true, data: { comment: insertedComment } }, { status: 201 });
}
