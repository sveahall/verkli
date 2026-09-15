import { z } from "zod";

export const MAX_PRODUCTION_SETTINGS_BYTES = 512 * 1024;

const sectionKindSchema = z.enum([
  "title", "copyright", "contents", "dedication", "foreword", "preface",
  "acknowledgements", "afterword", "bibliography", "about-author", "custom",
]);

export type ProductionSectionKind = z.infer<typeof sectionKindSchema>;

const productionSectionSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Section ID must contain only letters, numbers, hyphens, or underscores."),
  kind: sectionKindSchema,
  title: z.string().max(180),
  body: z.string().max(50_000),
  placement: z.enum(["before", "after"]),
  enabled: z.boolean(),
  startRecto: z.boolean(),
}).strict();

export type ProductionSection = z.infer<typeof productionSectionSchema>;

export const SECTION_TEMPLATES = [
  { kind: "title", label: "Title page", placement: "before", title: "Title page" },
  { kind: "copyright", label: "Copyright page", placement: "before", title: "Copyright" },
  { kind: "contents", label: "Table of contents", placement: "before", title: "Contents" },
  { kind: "dedication", label: "Dedication", placement: "before", title: "Dedication" },
  { kind: "foreword", label: "Foreword", placement: "before", title: "Foreword" },
  { kind: "preface", label: "Preface", placement: "before", title: "Preface" },
  { kind: "acknowledgements", label: "Acknowledgements", placement: "after", title: "Acknowledgements" },
  { kind: "afterword", label: "Afterword", placement: "after", title: "Afterword" },
  { kind: "bibliography", label: "Bibliography", placement: "after", title: "Bibliography" },
  { kind: "about-author", label: "About the author", placement: "after", title: "About the author" },
  { kind: "custom", label: "Custom section", placement: "after", title: "Additional section" },
] as const satisfies readonly {
  kind: ProductionSectionKind;
  label: string;
  placement: ProductionSection["placement"];
  title: string;
}[];

const automaticSectionKinds = new Set<ProductionSectionKind>(["title", "copyright", "contents"]);

// Asset authorization belongs to the server. This only accepts bounded storage
// paths, so a saved cover cannot introduce a URL, encoded traversal, or CSS.
const assetPathSchema = z.string().min(1).max(512)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/, "Cover artwork must use a relative storage path.")
  .refine((path) => path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."), {
    message: "Cover artwork path cannot contain empty or traversal segments.",
  }).nullable();

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color, such as #FFFFFF.");
const marginSchema = z.number().finite().min(8).max(50);

export function isValidIsbn13(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^97[89]\d{10}$/.test(digits)) return false;
  const sum = Array.from(digits).reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
}

export const productionSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().max(180),
  subtitle: z.string().max(240),
  author: z.string().max(180),
  publisher: z.string().max(180),
  edition: z.string().max(80),
  publicationYear: z.string().max(16),
  isbn: z.string().max(32).refine((value) => !value.trim() || isValidIsbn13(value), {
    message: "Enter a valid ISBN-13, or leave it blank.",
  }),
  rightsText: z.string().max(10_000),
  trimWidthMm: z.number().finite().min(90).max(320),
  trimHeightMm: z.number().finite().min(140).max(400),
  bleedMm: z.number().finite().min(0).max(10),
  gutterMm: marginSchema,
  outerMarginMm: marginSchema,
  topMarginMm: marginSchema,
  bottomMarginMm: marginSchema,
  fontSizePt: z.number().finite().min(9).max(16),
  leading: z.number().finite().min(1.1).max(1.9),
  font: z.enum(["serif", "sans"]),
  chaptersStartRecto: z.boolean(),
  spineWidthMm: z.number().finite().min(0.5).max(100).nullable(),
  paperNote: z.string().max(1_000),
  cover: z.object({
    frontPath: assetPathSchema,
    backPath: assetPathSchema,
    backText: z.string().max(10_000),
    spineText: z.string().max(360),
    background: colorSchema,
    textColor: colorSchema,
    reserveBarcode: z.boolean(),
    printTitle: z.boolean(),
  }).strict(),
  sections: z.array(productionSectionSchema).max(40),
}).strict().superRefine((settings, context) => {
  if (settings.trimWidthMm - settings.gutterMm - settings.outerMarginMm < 40) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["gutterMm"], message: "Margins must leave at least 40 mm of text width." });
  }
  if (settings.trimHeightMm - settings.topMarginMm - settings.bottomMarginMm < 60) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["topMarginMm"], message: "Margins must leave at least 60 mm of text height." });
  }

  const ids = new Set<string>();
  const automaticKinds = new Set<ProductionSectionKind>();
  settings.sections.forEach((section, index) => {
    if (ids.has(section.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "id"], message: "Each section must have a unique ID." });
    }
    ids.add(section.id);
    if (!automaticSectionKinds.has(section.kind)) return;
    if (automaticKinds.has(section.kind)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "kind"], message: "Add only one title page, copyright page, or table of contents." });
    }
    automaticKinds.add(section.kind);
    if (section.placement !== "before") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "placement"], message: "Automatic pages must appear before the manuscript." });
    }
  });

  if (new TextEncoder().encode(JSON.stringify(settings)).byteLength > MAX_PRODUCTION_SETTINGS_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production settings exceed 512 KiB. Shorten the additional sections before saving." });
  }
});

export type ProductionSettings = z.infer<typeof productionSettingsSchema>;

export function createProductionSection(kind: ProductionSectionKind): ProductionSection {
  const template = SECTION_TEMPLATES.find((candidate) => candidate.kind === kind);
  if (!template) throw new Error("Unknown production section kind.");
  return {
    id: crypto.randomUUID(),
    kind,
    title: template.title,
    body: "",
    placement: template.placement,
    enabled: true,
    startRecto: kind !== "copyright",
  };
}

export function createProductionSettings(seed?: { title?: string; author?: string }): ProductionSettings {
  return {
    schemaVersion: 1,
    title: seed?.title ?? "",
    subtitle: "",
    author: seed?.author ?? "",
    publisher: "",
    edition: "",
    publicationYear: "",
    isbn: "",
    rightsText: "",
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
    paperNote: "",
    cover: {
      frontPath: null,
      backPath: null,
      backText: "",
      spineText: "",
      background: "#F4EFE6",
      textColor: "#1C1917",
      reserveBarcode: true,
      printTitle: true,
    },
    sections: (["title", "copyright", "contents"] as const).map(createProductionSection),
  };
}

export function getCoverGeometry(settings: ProductionSettings): {
  widthMm: number | null;
  heightMm: number;
  spineWidthMm: number | null;
  frontXMm: number | null;
  backXMm: number;
} {
  const { trimWidthMm, trimHeightMm, bleedMm, spineWidthMm } = settings;
  return {
    widthMm: spineWidthMm === null ? null : trimWidthMm * 2 + spineWidthMm + bleedMm * 2,
    heightMm: trimHeightMm + bleedMm * 2,
    spineWidthMm,
    frontXMm: spineWidthMm === null ? null : bleedMm + trimWidthMm + spineWidthMm,
    backXMm: bleedMm,
  };
}
