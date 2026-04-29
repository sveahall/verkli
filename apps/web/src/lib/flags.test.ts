import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAudiobookEnabled,
  getDiscoverHref,
  getDiscoveryEnabled,
  getFreemiumGateEnabled,
  getMarketingEnabled,
  getSprint0DemoBadgeEnabled,
  getTranslationsEnabled,
  isAudiobookEnabled,
  isDiscoveryEnabled,
  isFreemiumGateEnabled,
  isMarketingEnabled,
  isSprint0DemoBadgeEnabled,
  isTranslationsEnabled,
} from "./flags";

const FLAG_ENV_VARS = [
  "NEXT_PUBLIC_TRANSLATIONS_ENABLED",
  "NEXT_PUBLIC_MARKETING_ENABLED",
  "NEXT_PUBLIC_DISCOVERY_ENABLED",
  "NEXT_PUBLIC_AUDIOBOOK_ENABLED",
  "NEXT_PUBLIC_FREEMIUM_GATE_ENABLED",
  "NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED",
  "TRANSLATIONS_ENABLED",
  "MARKETING_ENABLED",
  "DISCOVERY_ENABLED",
  "AUDIOBOOK_ENABLED",
  "FREEMIUM_GATE_ENABLED",
  "SPRINT0_DEMO_BADGE_ENABLED",
] as const;

describe("flags — default-OFF semantics", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of FLAG_ENV_VARS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of FLAG_ENV_VARS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("getMarketingEnabled defaults to false when env unset", () => {
    expect(getMarketingEnabled()).toBe(false);
  });

  it("getTranslationsEnabled defaults to false when env unset", () => {
    expect(getTranslationsEnabled()).toBe(false);
  });

  it("getDiscoveryEnabled defaults to false when env unset", () => {
    expect(getDiscoveryEnabled()).toBe(false);
  });

  it("getDiscoverHref returns null when discovery flag is unset", () => {
    expect(getDiscoverHref()).toBeNull();
  });

  it("getDiscoverHref returns the route when discovery flag is on", () => {
    process.env.NEXT_PUBLIC_DISCOVERY_ENABLED = "true";
    expect(getDiscoverHref()).toBe("/reader/discover");
  });

  it("getAudiobookEnabled defaults to false when env unset", () => {
    expect(getAudiobookEnabled()).toBe(false);
  });

  it("getFreemiumGateEnabled defaults to false when env unset", () => {
    expect(getFreemiumGateEnabled()).toBe(false);
  });

  it("isMarketingEnabled defaults to false when env unset", () => {
    expect(isMarketingEnabled()).toBe(false);
  });

  it("isTranslationsEnabled defaults to false when env unset", () => {
    expect(isTranslationsEnabled()).toBe(false);
  });

  it("isDiscoveryEnabled defaults to false when env unset", () => {
    expect(isDiscoveryEnabled()).toBe(false);
  });

  it("isAudiobookEnabled defaults to false when env unset", () => {
    expect(isAudiobookEnabled()).toBe(false);
  });

  it("isFreemiumGateEnabled defaults to false when env unset", () => {
    expect(isFreemiumGateEnabled()).toBe(false);
  });

  it("empty string is treated as unset (false)", () => {
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "";
    expect(getTranslationsEnabled()).toBe(false);
  });

  it("explicit 'true' enables", () => {
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "true";
    expect(getTranslationsEnabled()).toBe(true);
  });

  it("explicit '1' enables", () => {
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "1";
    expect(getTranslationsEnabled()).toBe(true);
  });

  it("explicit 'false' disables", () => {
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "false";
    expect(getTranslationsEnabled()).toBe(false);
  });

  it("non-truthy values disable", () => {
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "yes";
    expect(getTranslationsEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "0";
    expect(getTranslationsEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED = "TRUE  ";
    expect(getTranslationsEnabled()).toBe(false);
  });

  it("isXxx fallback prefers NEXT_PUBLIC_ over server-only var", () => {
    process.env.NEXT_PUBLIC_MARKETING_ENABLED = "true";
    process.env.MARKETING_ENABLED = "false";
    expect(isMarketingEnabled()).toBe(true);
  });

  it("isXxx falls back to non-public env when NEXT_PUBLIC_ unset", () => {
    process.env.MARKETING_ENABLED = "true";
    expect(isMarketingEnabled()).toBe(true);
  });

  it("getSprint0DemoBadgeEnabled defaults to false", () => {
    expect(getSprint0DemoBadgeEnabled()).toBe(false);
  });

  it("getSprint0DemoBadgeEnabled enables when NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED=true", () => {
    process.env.NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED = "true";
    expect(getSprint0DemoBadgeEnabled()).toBe(true);
  });

  it("isSprint0DemoBadgeEnabled defaults to false", () => {
    expect(isSprint0DemoBadgeEnabled()).toBe(false);
  });

  it("isSprint0DemoBadgeEnabled accepts non-public fallback", () => {
    process.env.SPRINT0_DEMO_BADGE_ENABLED = "1";
    expect(isSprint0DemoBadgeEnabled()).toBe(true);
  });
});
