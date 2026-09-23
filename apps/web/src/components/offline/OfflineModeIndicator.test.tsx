import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ online: true, legacyFlag: false }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [state.online, vi.fn()],
}));
vi.mock("@/lib/flags", () => ({ getOfflineReadingEnabled: () => state.legacyFlag }));

import OfflineModeIndicator from "./OfflineModeIndicator";

describe("reader connection status", () => {
  beforeEach(() => { state.online = true; state.legacyFlag = false; });

  it("does not show a connection warning while online", () => {
    expect(renderToStaticMarkup(<OfflineModeIndicator />)).toBe("");
  });

  it.each([false, true])("explains the online requirement with the legacy offline flag %s", (legacyFlag) => {
    state.online = false;
    state.legacyFlag = legacyFlag;
    const html = renderToStaticMarkup(<OfflineModeIndicator />);
    expect(html).toContain('role="status"');
    expect(html).toContain("No internet connection");
    expect(html).toContain("Reconnect to continue reading or listening.");
    expect(html).not.toContain("Offline mode");
  });
});
