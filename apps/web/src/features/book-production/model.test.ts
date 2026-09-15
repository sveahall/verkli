import { describe, expect, it } from "vitest";
import {
  createProductionSection,
  createProductionSettings,
  getCoverGeometry,
  isValidIsbn13,
  productionSettingsSchema,
  SECTION_TEMPLATES,
} from "./model";

describe("production defaults", () => {
  it("starts an A5 edition with automatic front matter and no invented rights claim", () => {
    const settings = createProductionSettings({ title: "The last ferry", author: "Ada Example" });

    expect(productionSettingsSchema.safeParse(settings).success).toBe(true);
    expect(settings).toMatchObject({
      schemaVersion: 1,
      title: "The last ferry",
      author: "Ada Example",
      rightsText: "",
      isbn: "",
      trimWidthMm: 148,
      trimHeightMm: 210,
      bleedMm: 3,
      gutterMm: 20,
      outerMarginMm: 15,
      topMarginMm: 18,
      bottomMarginMm: 20,
      fontSizePt: 11,
      leading: 1.45,
      font: "serif",
      chaptersStartRecto: true,
      spineWidthMm: null,
      cover: { frontPath: null, backPath: null, reserveBarcode: true, printTitle: true },
    });
    expect(settings.sections.map(({ kind, enabled, placement }) => ({ kind, enabled, placement })))
      .toEqual(["title", "copyright", "contents"].map((kind) => ({ kind, enabled: true, placement: "before" })));
    expect(settings.sections.every((section) => section.body === "")).toBe(true);
    expect(settings.sections.find((section) => section.kind === "copyright")?.startRecto).toBe(false);
  });

  it("creates independent arrays, nested objects, and section IDs for each edition", () => {
    const first = createProductionSettings();
    const second = createProductionSettings();
    first.sections[0].body = "Changed";
    first.cover.backText = "Different back cover";
    first.sections.push(createProductionSection("foreword"));

    expect(second.sections).toHaveLength(3);
    expect(second.sections[0].body).toBe("");
    expect(second.cover.backText).toBe("");
    expect(first.sections[0].id).not.toBe(second.sections[0].id);
  });

  it("creates a valid section from every English template", () => {
    for (const template of SECTION_TEMPLATES) {
      const section = createProductionSection(template.kind);
      const settings = createProductionSettings();
      settings.sections = [section];
      expect(section).toMatchObject({
        kind: template.kind, title: template.title, placement: template.placement, enabled: true, body: "",
      });
      expect(section.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(template.label).not.toBe("");
      expect(productionSettingsSchema.safeParse(settings).success).toBe(true);
    }
  });
});

describe("production validation", () => {
  it.each([
    ["trimWidthMm", 89], ["trimWidthMm", 321],
    ["trimHeightMm", 139], ["trimHeightMm", 401],
    ["bleedMm", -1], ["bleedMm", 11],
    ["gutterMm", 7], ["outerMarginMm", 51],
    ["topMarginMm", 7], ["bottomMarginMm", 51],
    ["fontSizePt", 8], ["fontSizePt", 17],
    ["leading", 1], ["leading", 2],
    ["spineWidthMm", 0], ["spineWidthMm", 101],
    ["trimWidthMm", Number.NaN], ["leading", Number.POSITIVE_INFINITY],
    ["fontSizePt", "11"], ["schemaVersion", 2],
  ])("rejects invalid %s = %s", (key, value) => {
    expect(productionSettingsSchema.safeParse({ ...createProductionSettings(), [key]: value }).success).toBe(false);
  });

  it("accepts boundary dimensions only when the text area remains usable", () => {
    expect(productionSettingsSchema.safeParse({
      ...createProductionSettings(), trimWidthMm: 90, trimHeightMm: 140,
      gutterMm: 25, outerMarginMm: 25, topMarginMm: 40, bottomMarginMm: 40,
      bleedMm: 0, fontSizePt: 9, leading: 1.1, spineWidthMm: 0.5,
    }).success).toBe(true);
    expect(productionSettingsSchema.safeParse({
      ...createProductionSettings(), trimWidthMm: 90, gutterMm: 26, outerMarginMm: 25,
    }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({
      ...createProductionSettings(), trimHeightMm: 140, topMarginMm: 41, bottomMarginMm: 40,
    }).success).toBe(false);
  });

  it("rejects duplicate IDs, duplicate automatic sections, and automatic sections after the manuscript", () => {
    const settings = createProductionSettings();
    const foreword = createProductionSection("foreword");
    const duplicateId = { ...foreword, kind: "preface", title: "Preface" };
    expect(productionSettingsSchema.safeParse({ ...settings, sections: [foreword, duplicateId] }).success).toBe(false);

    for (const kind of ["title", "copyright", "contents"] as const) {
      expect(productionSettingsSchema.safeParse({
        ...settings, sections: [createProductionSection(kind), createProductionSection(kind)],
      }).success).toBe(false);
      expect(productionSettingsSchema.safeParse({
        ...settings, sections: [{ ...createProductionSection(kind), placement: "after" }],
      }).success).toBe(false);
    }
  });

  it("bounds section count, individual text fields, and total serialized data", () => {
    const settings = createProductionSettings();
    const section = createProductionSection("custom");
    expect(productionSettingsSchema.safeParse({ ...settings, title: "a".repeat(181) }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({ ...settings, sections: [{ ...section, title: "a".repeat(181) }] }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({ ...settings, sections: [{ ...section, body: "a".repeat(50_001) }] }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({
      ...settings, sections: Array.from({ length: 41 }, () => createProductionSection("custom")),
    }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({
      ...settings, sections: Array.from({ length: 40 }, () => ({ ...createProductionSection("custom"), body: "å".repeat(50_000) })),
    }).success).toBe(false);
  });

  it.each([null, [], "settings", {}, { schemaVersion: 1 }])("safely rejects malformed input %j", (input) => {
    expect(productionSettingsSchema.safeParse(input).success).toBe(false);
  });

  it("rejects unsupported metadata at every editable object level", () => {
    const settings = createProductionSettings();
    expect(productionSettingsSchema.safeParse({ ...settings, secretMetadata: "token" }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({ ...settings, cover: { ...settings.cover, url: "https://example.com/image.jpg" } }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({
      ...settings, sections: [{ ...createProductionSection("foreword"), secretMetadata: "token" }],
    }).success).toBe(false);
  });

  it.each(["../cover.jpg", "user/../cover.jpg", "user/./cover.jpg", "/cover.jpg", "user//cover.jpg", "user\\cover.jpg", "https://example.com/cover.jpg", "file:cover.jpg", "user/%2e%2e/cover.jpg", "x".repeat(513)])(
    "rejects an unsafe cover path %s", (path) => {
      const settings = createProductionSettings();
      for (const key of ["frontPath", "backPath"]) {
        expect(productionSettingsSchema.safeParse({ ...settings, cover: { ...settings.cover, [key]: path } }).success).toBe(false);
      }
    },
  );

  it("accepts relative asset paths and rejects unsafe color values", () => {
    const settings = createProductionSettings();
    expect(productionSettingsSchema.safeParse({
      ...settings, cover: { ...settings.cover, frontPath: "user/book/edition/cover-1.jpg", backPath: "user/book/edition/back.png", background: "#aAbB01" },
    }).success).toBe(true);
    expect(productionSettingsSchema.safeParse({
      ...settings, cover: { ...settings.cover, background: "url(https://example.com)" },
    }).success).toBe(false);
  });
});

describe("ISBN-13", () => {
  it.each(["9780306406157", "978-0-306-40615-7", " 978 0 306 40615 7 "])("accepts a valid checksum %s", (isbn) => {
    expect(isValidIsbn13(isbn)).toBe(true);
    expect(productionSettingsSchema.safeParse({ ...createProductionSettings(), isbn }).success).toBe(true);
  });

  it.each(["", "   ", "9780306406158", "0306406152", "0000000000000", "ISBN 9780306406157", "9780306406157<script>"])("rejects invalid ISBN %s", (isbn) => {
    expect(isValidIsbn13(isbn)).toBe(false);
    if (isbn.trim()) expect(productionSettingsSchema.safeParse({ ...createProductionSettings(), isbn }).success).toBe(false);
  });
});

describe("cover geometry", () => {
  it("includes outer bleed once on each edge of the back-spine-front wrap", () => {
    expect(getCoverGeometry({ ...createProductionSettings(), spineWidthMm: 12 })).toEqual({
      widthMm: 314, heightMm: 216, spineWidthMm: 12, frontXMm: 163, backXMm: 3,
    });
    expect(getCoverGeometry({ ...createProductionSettings(), trimWidthMm: 152.4, trimHeightMm: 228.6, bleedMm: 0, spineWidthMm: 10.5 }))
      .toEqual({ widthMm: 315.3, heightMm: 228.6, spineWidthMm: 10.5, frontXMm: 162.9, backXMm: 0 });
  });

  it("keeps wrap width and front position unknown until the printer spine is supplied", () => {
    expect(getCoverGeometry(createProductionSettings())).toEqual({
      widthMm: null, heightMm: 216, spineWidthMm: null, frontXMm: null, backXMm: 3,
    });
  });
});
