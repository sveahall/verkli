"use client";

import { useDemoHotkeys } from "./useDemoHotkeys";

/**
 * Tiny client-component shim that mounts the demo hotkey listener.
 * AuthorAppShell renders it under the demoModeActive gate so the
 * keydown handler only attaches when we're inside a pitch session.
 */
export default function DemoHotkeysHost({ enabled }: { enabled: boolean }) {
  useDemoHotkeys({ enabled });
  return null;
}
