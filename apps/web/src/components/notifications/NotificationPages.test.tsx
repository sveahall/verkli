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
});
