import { describe, expect, it } from "vitest";
import { detectLanguageFromText } from "./language-detect";

/**
 * Two branches independently taught the detector Dutch and Polish, and the
 * merge kept both: real word lists first, then empty `nl: []` / `pl: []`
 * placeholders. The later key wins in an object literal, so the merge silently
 * undid the feature it was merging — the compiler only called it a duplicate
 * property, which reads like a lint nit rather than a lost language.
 */
describe("manuscript language detection", () => {
  it.each([
    ["nl", "Het was een koude ochtend en zijn brief lag nog altijd ongeopend op de tafel voor het raam."],
    ["pl", "Nie było już czasu, a jego list wciąż leżał nieotwarty na stole przy oknie tylko dlatego."],
    ["sv", "Det var en kall morgon och hans brev låg fortfarande oöppnat på bordet inte långt från fönstret."],
    ["en", "It was a cold morning and the letter was still unopened on the table that stood by the window."],
  ])("recognises %s prose", (code, text) => {
    expect(detectLanguageFromText(text)).toBe(code);
  });
});
