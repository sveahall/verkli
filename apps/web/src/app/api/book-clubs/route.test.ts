import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_CLUBS_FEATURE_DISABLED } from "@/lib/api-errors";
import { createSupabaseClientMock } from "../_test-helpers/supabase";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isBookClubsEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/flags", () => ({
  isBookClubsEnabled: mocks.isBookClubsEnabled,
}));

const { GET, POST } = await import("./route");

const USER_ID = "reader-1";

describe("/api/book-clubs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isBookClubsEnabled.mockReturnValue(true);
  });

  it("GET returns club list", async () => {
    const clubs = [
      {
        id: "club-1",
        name: "Sci-Fi Circle",
        description: "Weekly sci-fi reads",
        cover_url: null,
        is_public: true,
        max_members: 50,
        current_book_id: null,
        creator_id: USER_ID,
        created_at: "2026-02-01T10:00:00.000Z",
      },
    ];

    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        book_clubs: {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({ data: clubs, error: null })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clubs).toEqual(clubs);
  });

  it("POST creates a new club", async () => {
    const createdClub = {
      id: "club-2",
      name: "Mystery Fans",
      description: "Crime and thriller picks",
      cover_url: null,
      is_public: true,
      max_members: 60,
      current_book_id: null,
      creator_id: USER_ID,
      created_at: "2026-02-02T10:00:00.000Z",
    };

    let insertedClubPayload: Record<string, unknown> | null = null;

    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        book_clubs: {
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedClubPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: createdClub, error: null })),
              })),
            };
          }),
        },
        book_club_members: {
          insert: vi.fn(async () => ({ error: null })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request("http://localhost/api/book-clubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Mystery Fans",
        description: "Crime and thriller picks",
        is_public: true,
        max_members: 60,
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.club).toEqual(createdClub);
    expect(insertedClubPayload).toMatchObject({
      name: "Mystery Fans",
      creator_id: USER_ID,
      is_public: true,
      max_members: 60,
    });
  });

  it("returns feature flag error when disabled", async () => {
    mocks.isBookClubsEnabled.mockReturnValue(false);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_CLUBS_FEATURE_DISABLED);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
