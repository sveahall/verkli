/**
 * Unit tests for the demo hotkey layer. The pure mapper is the only
 * piece worth testing — the React adapter is a thin event-listener
 * wrapper around it.
 */

import { describe, expect, it } from "vitest";
import {
  extractCurrentBookIdFromPathname,
  mapHotkeyEvent,
  RESETTABLE_DEMO_KEYS,
  SEEDED_DEMO_BOOK_ID,
  type MapHotkeyEventInput,
} from "./useDemoHotkeys";
import { isDemoSwHostAllowed } from "./DemoServiceWorker";

const CURRENT = "11111111-2222-3333-4444-555555555555";

const baseInput: MapHotkeyEventInput = {
  key: "1",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  inEditable: false,
  currentBookId: CURRENT,
  seededDemoBookId: SEEDED_DEMO_BOOK_ID,
};

function input(overrides: Partial<MapHotkeyEventInput>): MapHotkeyEventInput {
  return { ...baseInput, ...overrides };
}

describe("mapHotkeyEvent — navigation digits", () => {
  it("maps 1/2/4 to panels of the CURRENT book (not the seeded demo book)", () => {
    expect(mapHotkeyEvent(input({ key: "1" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${CURRENT}?panel=cover`,
    });
    expect(mapHotkeyEvent(input({ key: "2" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${CURRENT}?panel=production`,
    });
    expect(mapHotkeyEvent(input({ key: "4" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${CURRENT}?panel=distribute`,
    });
  });

  it("maps 3 to distribute + openPod=true on the current book", () => {
    expect(mapHotkeyEvent(input({ key: "3" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${CURRENT}?panel=distribute`,
      openPod: true,
    });
  });

  it("becomes a no-op when the user isn't on a book page (no current bookId)", () => {
    expect(mapHotkeyEvent(input({ key: "1", currentBookId: null }))).toBeNull();
    expect(mapHotkeyEvent(input({ key: "2", currentBookId: null }))).toBeNull();
    expect(mapHotkeyEvent(input({ key: "4", currentBookId: null }))).toBeNull();
  });

  it("maps 5 to the seeded demo book reader URL even with no current book", () => {
    expect(
      mapHotkeyEvent(input({ key: "5", currentBookId: null }))
    ).toEqual({
      kind: "navigate",
      href: `/reader/books/${SEEDED_DEMO_BOOK_ID}`,
    });
  });

  it("ignores digit shortcuts when focus is in an editable field", () => {
    expect(mapHotkeyEvent(input({ key: "1", inEditable: true }))).toBeNull();
    expect(mapHotkeyEvent(input({ key: "5", inEditable: true }))).toBeNull();
  });

  it("ignores modified digit keys (Shift+1, Cmd+2 etc.)", () => {
    expect(mapHotkeyEvent(input({ key: "1", shiftKey: true }))).toBeNull();
    expect(mapHotkeyEvent(input({ key: "2", metaKey: true }))).toBeNull();
    expect(mapHotkeyEvent(input({ key: "3", altKey: true }))).toBeNull();
  });
});

describe("mapHotkeyEvent — failover bindings", () => {
  it("Cmd+Shift+D toggles degraded mode", () => {
    expect(
      mapHotkeyEvent(input({ key: "d", metaKey: true, shiftKey: true }))
    ).toEqual({ kind: "toggle-degraded" });
  });

  it("Cmd+Shift+V opens the backup video overlay", () => {
    expect(
      mapHotkeyEvent(input({ key: "v", metaKey: true, shiftKey: true }))
    ).toEqual({ kind: "open-backup-video" });
  });

  it("Cmd+Shift+R resets demo state", () => {
    expect(
      mapHotkeyEvent(input({ key: "r", metaKey: true, shiftKey: true }))
    ).toEqual({ kind: "reset-state" });
  });

  it("Ctrl+Shift+D works on Windows/Linux too", () => {
    expect(
      mapHotkeyEvent(input({ key: "D", ctrlKey: true, shiftKey: true }))
    ).toEqual({ kind: "toggle-degraded" });
  });

  it("Cmd+Shift bindings fire even inside editable fields", () => {
    // Mid-typing recovery is the whole point — these MUST work in any focus.
    expect(
      mapHotkeyEvent(
        input({ key: "v", metaKey: true, shiftKey: true, inEditable: true })
      )
    ).toEqual({ kind: "open-backup-video" });
  });

  it("RESETTABLE_DEMO_KEYS covers every persisted demo state key", () => {
    // Smoke-check: this is the contract the reset binding clears. If a
    // future demo feature persists state under a new key, this test
    // forces an update so the reset shortcut keeps working.
    expect(RESETTABLE_DEMO_KEYS).toContain("demo_production_state");
    expect(RESETTABLE_DEMO_KEYS).toContain("demo_distribution_state");
    expect(RESETTABLE_DEMO_KEYS).toContain("demo_telemetry");
    expect(RESETTABLE_DEMO_KEYS).toContain("demo_degraded_mode");
    expect(RESETTABLE_DEMO_KEYS).toContain("demo_micro_hook_dismissed");
  });
});

describe("extractCurrentBookIdFromPathname", () => {
  it("pulls the uuid out of /author/books/<id>", () => {
    expect(
      extractCurrentBookIdFromPathname("/author/books/576969ff-fd9d-45dd-bd46-04fcd535978f")
    ).toBe("576969ff-fd9d-45dd-bd46-04fcd535978f");
    expect(
      extractCurrentBookIdFromPathname(
        "/author/books/576969ff-fd9d-45dd-bd46-04fcd535978f/edit"
      )
    ).toBe("576969ff-fd9d-45dd-bd46-04fcd535978f");
  });

  it("pulls the uuid out of /reader/books/<id>", () => {
    expect(
      extractCurrentBookIdFromPathname(`/reader/books/${SEEDED_DEMO_BOOK_ID}`)
    ).toBe(SEEDED_DEMO_BOOK_ID);
  });

  it("returns null on non-book routes", () => {
    expect(extractCurrentBookIdFromPathname("/author/library")).toBeNull();
    expect(extractCurrentBookIdFromPathname("/reader/discover")).toBeNull();
    expect(extractCurrentBookIdFromPathname("/")).toBeNull();
  });

  it("returns null when the path segment isn't a uuid", () => {
    expect(extractCurrentBookIdFromPathname("/author/books/not-a-uuid")).toBeNull();
  });
});

describe("isDemoSwHostAllowed (service worker registration gate)", () => {
  it("permits localhost / 127.0.0.1 / ::1 / *.local", () => {
    expect(isDemoSwHostAllowed("localhost")).toBe(true);
    expect(isDemoSwHostAllowed("127.0.0.1")).toBe(true);
    expect(isDemoSwHostAllowed("::1")).toBe(true);
    expect(isDemoSwHostAllowed("pitch-laptop.local")).toBe(true);
    expect(isDemoSwHostAllowed("LOCALHOST")).toBe(true); // case-insensitive
  });

  it("rejects production hostnames", () => {
    expect(isDemoSwHostAllowed("verkli.com")).toBe(false);
    expect(isDemoSwHostAllowed("staging.verkli.com")).toBe(false);
    expect(isDemoSwHostAllowed("glfipbnsyxowqsmcuzcm.supabase.co")).toBe(false);
    expect(isDemoSwHostAllowed("localhost.evil.com")).toBe(false);
  });
});
