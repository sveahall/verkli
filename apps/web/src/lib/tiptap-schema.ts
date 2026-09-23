/**
 * The chapter document's ProseMirror schema, shared by the browser editor and
 * the server.
 *
 * This list used to live inline in TiptapEditor.tsx, behind "use client", which
 * made it unreachable from a route handler. That is the reason every agent edit
 * had to be applied inside an open browser tab: the server had no way to build
 * the same document. Server-side tools now build it here — `Node.fromJSON(
 * chapterSchema, …)` — so a text edit has one implementation for both sides and
 * the two cannot drift apart.
 *
 * UI-only extensions (Placeholder, CharacterCount) are deliberately absent.
 * They contribute no nodes or marks, so leaving them out changes no document,
 * and importing them on the server would pull browser globals in for nothing.
 * TiptapEditor adds them on top of this list.
 */

import { getSchema } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import StarterKit from "@tiptap/starter-kit";

/**
 * A factory rather than a shared array: a configured Tiptap extension carries
 * per-instance storage, and the author workspace can hold more than one editor
 * alive at a time (a chapter and a translation preview). Handing both the same
 * instance makes them share that storage.
 */
export function chapterSchemaExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    FontFamily,
    // Underline comes from StarterKit (v3) — registering the standalone
    // @tiptap/extension-underline too triggers a "Duplicate extension names
    // found: ['underline']" warning.
    Highlight.configure({ multicolor: true }),
  ];
}

/** The schema every stored chapter is parsed and serialised against. */
export const chapterSchema = getSchema(chapterSchemaExtensions());
