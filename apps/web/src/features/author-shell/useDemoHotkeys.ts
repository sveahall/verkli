"use client";

import { useEffect, useRef } from "react";

/**
 * Investor-pitch hotkey layer. Active only when demoModeActive=true,
 * mounted globally inside the (app-author) shell. Two key classes:
 *
 *   Navigation (1–5)
 *     1: workspace cover-panel
 *     2: workspace production-panel
 *     3: distribute-panel + auto-open POD modal
 *     4: workspace distribute-panel
 *     5: reader-finalen for the seeded demo book
 *
 *   Failover (Cmd+Shift+…)
 *     Cmd+Shift+D: degraded mode — useBookCover skips the live call
 *                  and the 8 s loader and snaps fallback PNGs immediately
 *                  on the next Generate click
 *     Cmd+Shift+V: fullscreen backup video overlay
 *     Cmd+Shift+R: reset all demo state (localStorage clears + reload)
 *
 * The hook is split into a pure mapper (mapHotkeyEvent) and a thin
 * React adapter (useDemoHotkeys). The mapper is unit-tested without
 * jsdom; the adapter just dispatches the resolved action.
 */

/** UUID of the seeded "Inget kan stoppa oss nu / haunted-diary" demo book. */
export const DEMO_BOOK_ID = "6abdd304-7bc3-41a1-a841-4bf764621ac3";

export const DEGRADED_MODE_KEY = "demo_degraded_mode";
export const BACKUP_VIDEO_EVENT = "demo:backup-video";
export const POD_MODAL_EVENT = "demo:open-pod-modal";

export const RESETTABLE_DEMO_KEYS: ReadonlyArray<string> = [
  "demo_production_state",
  "demo_distribution_state",
  "demo_telemetry",
  "demo_micro_hook_dismissed",
  "demo_degraded_mode",
];

export type DemoHotkeyAction =
  | { kind: "navigate"; href: string; openPod?: boolean }
  | { kind: "open-backup-video" }
  | { kind: "toggle-degraded" }
  | { kind: "reset-state" };

export interface MapHotkeyEventInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True when focus is in an input/textarea/contenteditable. Plain digit
   * shortcuts must NOT fire while the user is typing — only Cmd+Shift
   * combinations bypass that guard. */
  inEditable: boolean;
  bookId: string;
}

/**
 * Pure mapper: returns the matching demo action or null. Exported for
 * tests; the adapter below just calls this and dispatches.
 */
export function mapHotkeyEvent(input: MapHotkeyEventInput): DemoHotkeyAction | null {
  const cmdOrCtrl = input.metaKey || input.ctrlKey;

  // Cmd+Shift+… failover bindings — these must work even when focus is
  // in an input field, since the demo presenter uses them to recover
  // mid-keystroke.
  if (cmdOrCtrl && input.shiftKey) {
    const lower = input.key.toLowerCase();
    if (lower === "d") return { kind: "toggle-degraded" };
    if (lower === "v") return { kind: "open-backup-video" };
    if (lower === "r") return { kind: "reset-state" };
  }

  // Plain digit shortcuts — guard against inputs and modified keys.
  if (input.altKey || cmdOrCtrl || input.shiftKey || input.inEditable) return null;

  switch (input.key) {
    case "1":
      return {
        kind: "navigate",
        href: `/author/books/${input.bookId}?panel=cover`,
      };
    case "2":
      return {
        kind: "navigate",
        href: `/author/books/${input.bookId}?panel=production`,
      };
    case "3":
      return {
        kind: "navigate",
        href: `/author/books/${input.bookId}?panel=distribute`,
        openPod: true,
      };
    case "4":
      return {
        kind: "navigate",
        href: `/author/books/${input.bookId}?panel=distribute`,
      };
    case "5":
      return {
        kind: "navigate",
        href: `/reader/books/${DEMO_BOOK_ID}`,
      };
    default:
      return null;
  }
}

function isElementEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

interface UseDemoHotkeysOptions {
  enabled: boolean;
  /** Optional override — defaults to the seeded demo book; tests may pass another id. */
  bookId?: string;
}

interface DemoHotkeysExecutor {
  navigate: (href: string) => void;
  openBackupVideo: () => void;
  openPodModal: () => void;
  toggleDegraded: () => boolean;
  resetState: () => void;
}

/**
 * Build the default executor. Side-effects live here so the hook body
 * stays small enough to inspect at a glance.
 */
function buildDefaultExecutor(): DemoHotkeysExecutor {
  return {
    navigate(href: string) {
      if (typeof window === "undefined") return;
      window.location.assign(href);
    },
    openBackupVideo() {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(BACKUP_VIDEO_EVENT));
    },
    openPodModal() {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(POD_MODAL_EVENT));
    },
    toggleDegraded() {
      if (typeof window === "undefined") return false;
      try {
        const current = window.localStorage.getItem(DEGRADED_MODE_KEY) === "1";
        const next = !current;
        if (next) {
          window.localStorage.setItem(DEGRADED_MODE_KEY, "1");
        } else {
          window.localStorage.removeItem(DEGRADED_MODE_KEY);
        }
        return next;
      } catch {
        return false;
      }
    },
    resetState() {
      if (typeof window === "undefined") return;
      try {
        for (const key of RESETTABLE_DEMO_KEYS) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // best-effort
      }
      window.location.reload();
    },
  };
}

export function useDemoHotkeys({ enabled, bookId = DEMO_BOOK_ID }: UseDemoHotkeysOptions): void {
  const executorRef = useRef<DemoHotkeysExecutor | null>(null);
  if (executorRef.current === null) {
    executorRef.current = buildDefaultExecutor();
  }

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      const action = mapHotkeyEvent({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        inEditable: isElementEditable(event.target),
        bookId,
      });
      if (!action) return;
      const executor = executorRef.current;
      if (!executor) return;

      // Cmd+Shift bindings need preventDefault to avoid the browser's own
      // handlers (Cmd+Shift+R = hard reload, Cmd+Shift+D = bookmark all
      // tabs in some browsers, etc.).
      if (action.kind !== "navigate" || event.shiftKey || event.metaKey || event.ctrlKey) {
        event.preventDefault();
      }

      switch (action.kind) {
        case "navigate":
          executor.navigate(action.href);
          if (action.openPod) {
            // Defer the modal-open so it lands after navigation paints.
            window.setTimeout(() => executor.openPodModal(), 250);
          }
          break;
        case "open-backup-video":
          executor.openBackupVideo();
          break;
        case "toggle-degraded":
          executor.toggleDegraded();
          break;
        case "reset-state":
          executor.resetState();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, bookId]);
}
