import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TranslateMoreLanguagesCard } from "./TranslatePanel.components";

describe("Dutch and Polish text choices", () => {
  it.each([["nl", "Dutch"], ["pl", "Polish"]])("offers %s exactly once and keeps the selected choice enabled", (code, label) => {
    const html = renderToStaticMarkup(<TranslateMoreLanguagesCard sourceLanguage="sv" selectedLanguages={new Set([code])} onToggleLanguage={() => {}} />);
    expect(html.match(new RegExp(`aria-label="Translate to ${label}"`, "g"))).toHaveLength(1);
    expect(html).toContain(`aria-label="Translate to ${label}" checked=""`);
    expect(html).not.toContain(`disabled="" aria-label="Translate to ${label}"`);
  });
});
