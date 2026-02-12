import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseClientMock } from "../_test-helpers/supabase";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const { GET } = await import("./route");
const { PATCH } = await import("./[id]/route");
const { POST: markAllReadPOST } = await import("./mark-all-read/route");

const USER_ID = "reader-1";
const NOTIFICATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("/api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns notification list", async () => {
    const notifications = [
      {
        id: NOTIFICATION_ID,
        user_id: USER_ID,
        read: false,
        type: "system",
        created_at: "2026-02-01T10:00:00.000Z",
      },
    ];

    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        notifications: {
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              order: vi.fn(() => chain),
              range: vi.fn(async () => ({
                data: notifications,
                count: 1,
                error: null,
              })),
            };
            return chain;
          }),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await GET(new Request("http://localhost/api/notifications?page=1&limit=20"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notifications).toEqual(notifications);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
  });

  it("PATCH /[id] marks one notification as read", async () => {
    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        notifications: {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: NOTIFICATION_ID },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await PATCH(new Request(`http://localhost/api/notifications/${NOTIFICATION_ID}`), {
      params: Promise.resolve({ id: NOTIFICATION_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("POST /mark-all-read marks all unread notifications", async () => {
    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        notifications: {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(async () => ({
                  data: [{ id: "n1" }, { id: "n2" }],
                  error: null,
                })),
              })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await markAllReadPOST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, count: 2 });
  });
});
