import type { Attribute, Extension } from "@tiptap/core";
import BaseTextAlign from "@tiptap/extension-text-align";
import BaseLink from "@tiptap/extension-link";
import {
  FontFamily as BaseFontFamily,
  FontSize as BaseFontSize,
  LineHeight as BaseLineHeight,
} from "@tiptap/extension-text-style";

// Stored JSON skips Tiptap's HTML parsing and command validation. Validate at
// serialization too: chapter authors must not inject declarations into reader
// or moderator pages. Keep parsing, commands and supported formatting intact.
function constrainStyle<Options>(
  extension: Extension<Options>,
  attribute: string,
  accepts: (value: string) => boolean,
) {
  return extension.extend({
    addGlobalAttributes() {
      return (this.parent?.() ?? []).map((group) => {
        const original = group.attributes[attribute];
        if (!original) return group;
        return {
          ...group,
          attributes: {
            ...group.attributes,
            [attribute]: {
              ...original,
              renderHTML: (attributes: Record<string, unknown>) => {
                const value = attributes[attribute];
                if (typeof value !== "string" || value.length > 200 || !accepts(value)) return {};
                return original.renderHTML?.(attributes) ?? {};
              },
            },
          },
        };
      });
    },
  });
}

const length = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|pt|em|rem|%)$/;
const family = /^(?:[\p{L}\p{N}_ -]+|'[\p{L}\p{N}_ -]+'|"[\p{L}\p{N}_ -]+")(?:\s*,\s*(?:[\p{L}\p{N}_ -]+|'[\p{L}\p{N}_ -]+'|"[\p{L}\p{N}_ -]+"))*$/u;

export const TextAlign = constrainStyle(BaseTextAlign, "textAlign", (value) =>
  ["left", "center", "right", "justify", "start", "end"].includes(value),
);
export const FontFamily = constrainStyle(BaseFontFamily, "fontFamily", (value) => family.test(value));
export const FontSize = constrainStyle(BaseFontSize, "fontSize", (value) => length.test(value));
export const LineHeight = constrainStyle(BaseLineHeight, "lineHeight", (value) =>
  value === "normal" || /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || length.test(value),
);

// An author-supplied class can activate the app's compiled positioning utilities
// just as effectively as inline CSS. Keep trusted extension defaults, not classes
// loaded from chapter JSON or HTML.
export const Link = BaseLink.extend({
  addAttributes() {
    const attributes: Record<string, Attribute> = this.parent?.() ?? {};
    return { ...attributes, class: { ...attributes.class, rendered: false } };
  },
});
