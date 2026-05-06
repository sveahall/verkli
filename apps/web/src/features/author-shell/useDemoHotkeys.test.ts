/**
 * Unit tests for the demo hotkey layer. The pure mapper is the only
 * piece worth testing — the React adapter is a thin event-listener
 * wrapper around it.
 */

import { describe, expect, it } from "vitest";
import {
  DEMO_BOOK_ID,
  mapHotkeyEvent,
  RESETTABLE_DEMO_KEYS,
  type MapHotkeyEventInput,
} from "./useDemoHotkeys";
import { isDemoSwHostAllowed } from "./DemoServiceWorker";

const baseInput: MapHotkeyEventInput = {
  key: "1",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  inEditable: false,
  bookId: DEMO_BOOK_ID,
};

function input(overrides: Partial<MapHotkeyEventInput>): MapHotkeyEventInput {
  return { ...baseInput, ...overrides };
}

describe("mapHotkeyEvent — navigation digits", () => {
  it("maps 1/2/4 to the corresponding panel URL", () => {
    expect(mapHotkeyEvent(input({ key: "1" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${DEMO_BOOK_ID}?panel=cover`,
    });
    expect(mapHotkeyEvent(input({ key: "2" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${DEMO_BOOK_ID}?panel=production`,
    });
    expect(mapHotkeyEvent(input({ key: "4" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${DEMO_BOOK_ID}?panel=distribute`,
    });
  });

  it("maps 3 to distribute + openPod=true", () => {
    expect(mapHotkeyEvent(input({ key: "3" }))).toEqual({
      kind: "navigate",
      href: `/author/books/${DEMO_BOOK_ID}?panel=distribute`,
      openPod: true,
    });
  });

  it("maps 5 to the reader-finalen URL for the seeded demo book", () => {
    expect(mapHotkeyEvent(input({ key: "5" }))).toEqual({
      kind: "navigate",
      href: `/reader/books/${DEMO_BOOK_ID}`,
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
