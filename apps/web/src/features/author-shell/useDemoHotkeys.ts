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
 *                  and the 8 s loader and snaps fallback covers immediately
 *                  on the next Generate click
 *     Cmd+Shift+V: fullscreen backup video overlay
 *     Cmd+Shift+R: reset all demo state (localStorage clears + reload)
 *
 * The hook is split into a pure mapper (mapHotkeyEvent) and a thin
 * React adapter (useDemoHotkeys). The mapper is unit-tested without
 * jsdom; the adapter just dispatches the resolved action.
 */

/**
 * UUID of the seeded "the-haunted-diary" demo book that lives under the
 * verkli-demo author. Hotkey '5' (reader-finalen) always navigates here
 * because it's the only book with the full multilingual chapter data
 * the reader-finalen demo needs.
 *
 * Hotkeys 1-4 (author panels) navigate within the CURRENT book the user
 * is editing — extracted from the URL — so they don't drop a logged-in
 * user onto a book they don't own.
 */
export const SEEDED_DEMO_BOOK_ID = "6abdd304-7bc3-41a1-a841-4bf764621ac3";

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

/**
 * Storage key prefix for the per-book demo cover lifecycle written by
 * useBookCover (`verkli_demo_cover_<bookId>`). Per-book keys have dynamic
 * suffixes, so reset matches them by prefix instead of the static list.
 */
export const DEMO_COVER_STORAGE_PREFIX = "verkli_demo_cover_";

export const RESETTABLE_DEMO_KEY_PREFIXES: ReadonlyArray<string> = [
  DEMO_COVER_STORAGE_PREFIX,
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
  /** Current book id (from URL). Used by hotkeys 1-4 to stay within the
   * book the user is editing. Null when not on a book page. */
  currentBookId: string | null;
  /** Hardcoded id of the seeded demo book (for hotkey 5 → reader). */
  seededDemoBookId: string;
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

  // Hotkeys 1-4 navigate within the CURRENT book. If the user isn't on a
  // book page (e.g. on the library) there's nothing to scope to, so the
  // shortcut becomes a no-op — better than dropping them on a 404.
  const currentBookHref = (panel: string) =>
    input.currentBookId
      ? `/author/books/${input.currentBookId}?panel=${panel}`
      : null;

  switch (input.key) {
    case "1": {
      const href = currentBookHref("cover");
      return href ? { kind: "navigate", href } : null;
    }
    case "2": {
      const href = currentBookHref("production");
      return href ? { kind: "navigate", href } : null;
    }
    case "3": {
      const href = currentBookHref("distribute");
      return href ? { kind: "navigate", href, openPod: true } : null;
    }
    case "4": {
      const href = currentBookHref("distribute");
      return href ? { kind: "navigate", href } : null;
    }
    case "5":
      return {
        kind: "navigate",
        href: `/reader/books/${input.seededDemoBookId}`,
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
}

/**
 * Pull the current book uuid out of /author/books/<id>... or
 * /reader/books/<id>... pathnames. Returns null on any other route.
 */
export function extractCurrentBookIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/(?:author|reader)\/books\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

interface DemoHotkeysExecutor {
  navigate: (href: string) => void;
  openBackupVideo: () => void;
  openPodModal: () => void;
  toggleDegraded: () => boolean;
  resetState: () => void;
}

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
        // Prefix-matched keys (per-book entries with dynamic suffixes).
        // Collect first, then remove — deleting while iterating by index
        // shifts localStorage's key order and skips entries.
        const prefixed: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && RESETTABLE_DEMO_KEY_PREFIXES.some((p) => key.startsWith(p))) {
            prefixed.push(key);
          }
        }
        for (const key of prefixed) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // best-effort
      }
      window.location.reload();
    },
  };
}

export function useDemoHotkeys({ enabled }: UseDemoHotkeysOptions): void {
  const executorRef = useRef<DemoHotkeysExecutor | null>(null);
  if (executorRef.current === null) {
    executorRef.current = buildDefaultExecutor();
  }

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Read the live pathname on each keypress so navigating between
      // books picks up the new id without remounting the hook.
      const currentBookId = extractCurrentBookIdFromPathname(window.location.pathname);
      const action = mapHotkeyEvent({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        inEditable: isElementEditable(event.target),
        currentBookId,
        seededDemoBookId: SEEDED_DEMO_BOOK_ID,
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
  }, [enabled]);
}
