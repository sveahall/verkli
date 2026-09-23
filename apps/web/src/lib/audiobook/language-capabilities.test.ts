import { expect, it } from "vitest";
import { audioLanguageUnavailableReason } from "./language-capabilities";
import { SUPPORTED_LANGUAGE_CODES } from "../languages";

it.each(["nl", "NL-nl", " nl_NL ", "pl", "PL-pl"])("marks %s as text-only", (language) => {
  expect(audioLanguageUnavailableReason(language)).toContain("Text only:");
});
it.each(SUPPORTED_LANGUAGE_CODES.filter((language) => !["nl", "pl"].includes(language)))("preserves existing %s audio availability", (language) => {
  expect(audioLanguageUnavailableReason(language)).toBeNull();
});
it("does not accidentally classify prototype properties as languages", () => {
  expect(audioLanguageUnavailableReason("constructor")).toBeNull();
});
