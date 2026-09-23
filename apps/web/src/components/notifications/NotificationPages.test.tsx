import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/hooks/useNotifications", () => ({ useNotificationList: mocks.list }));
import ReaderNotificationsPage from "@/app/(app-reader)/reader/notifications/page";
import AuthorNotificationsPage from "@/app/(app-author)/author/notifications/page";

describe("notification pages", () => {
  beforeEach(() => mocks.list.mockReturnValue({ notifications: [], total: 0, loading: false, error: "Could not load notifications.", refetch: vi.fn() }));
  it.each([ReaderNotificationsPage, AuthorNotificationsPage])("distinguishes a failed load from an empty inbox", (Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Could not load notifications.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No notifications yet");
    expect(html).not.toContain("all caught up");
  });
  it.each([ReaderNotificationsPage, AuthorNotificationsPage])("keeps the global read action available when the current page is already read", (Page) => {
    mocks.list.mockReturnValue({
      notifications: Array.from({ length: 20 }, (_, index) => ({
        id: `read-${index}`, type: "system", title: "Already read", body: null,
        read: true, created_at: "2026-09-16T10:00:00Z", entity_type: null, entity_id: null,
      })),
      total: 40, loading: false, error: null, refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<Page />);
    const action = html.match(/<button\b[^>]*>Mark all as read<\/button>/)?.[0];
    expect(action).toBeDefined();
    expect(action).not.toContain("disabled");
  });

  it.each([ReaderNotificationsPage, AuthorNotificationsPage])("still prevents the global action while the notification page is loading", (Page) => {
    mocks.list.mockReturnValue({ notifications: [], total: 40, loading: true, error: null, refetch: vi.fn() });
    const html = renderToStaticMarkup(<Page />);
    const action = html.match(/<button\b[^>]*>Mark all as read<\/button>/)?.[0];
    expect(action).toContain("disabled");
  });

});
