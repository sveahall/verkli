export const CPI_POD_PRINT_SPEC = {
  type: "import",
  trimLabel: "A5",
  widthMm: 148,
  heightMm: 210,
  bookType: "SC",
  backing: "straight",
  coverPages: 1,
  lamination: "matt",
  coverPaperName: "275g_BD100",
  textPaperName: "90g_WD150",
  barcodePosition: "bottom-right",
  headTailBand: "none",
  ribbon: "none",
  colourPages: 0,
  minPageCount: 24,
  frontMatterPages: 8,
  wordsPerPage: 320,
} as const;

export type BookFormat = "softcover" | "hardcover";
export type PrintOnDemandEditionLimit = "unlimited" | "limited";

export type PrintOnDemandSettings = {
  enabled: boolean;
  formats: BookFormat[];
  editionLimit: PrintOnDemandEditionLimit;
  limitCount: number | null;
  isbn: string | null;
  softcoverPriceMinor: number | null;
  hardcoverPriceMinor: number | null;
  priceCurrency: string;
};

/** Minimum price floors in minor units (production + SE domestic shipping). */
export const POD_PRICE_FLOOR: Record<BookFormat, number> = {
  softcover: 9400,   // 94 kr = 55 production + 39 SE shipping
  hardcover: 14400,  // 144 kr = 95 production + 49 SE shipping
};

/** Production cost in minor units per format. */
export const POD_PRODUCTION_COST: Record<BookFormat, number> = {
  softcover: 5500,
  hardcover: 9500,
};

/** SE domestic shipping cost in minor units per format. */
export const POD_SHIPPING_COST_SE: Record<BookFormat, number> = {
  softcover: 3900,
  hardcover: 4900,
};

export const DEFAULT_PRINT_ON_DEMAND_SETTINGS: PrintOnDemandSettings = {
  enabled: false,
  formats: [],
  editionLimit: "unlimited",
  limitCount: null,
  isbn: null,
  softcoverPriceMinor: null,
  hardcoverPriceMinor: null,
  priceCurrency: "SEK",
};

const PRINT_FORMAT_ORDER: BookFormat[] = ["softcover", "hardcover"];

export type PrintChecklistStatus = "ready" | "review" | "missing";

export type PrintChecklistItem = {
  label: string;
  description: string;
  status: PrintChecklistStatus;
};

type MasteringPreviewInput = {
  title: string;
  author: string;
  isbn: string | null;
  totalExtent: number;
  fileStem: string;
};

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function normalizePrintOnDemandSettings(value: unknown): PrintOnDemandSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PRINT_ON_DEMAND_SETTINGS;
  }

  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === true;
  const editionLimit: PrintOnDemandEditionLimit =
    raw.editionLimit === "limited" ? "limited" : "unlimited";
  const limitCount = editionLimit === "limited" ? normalizePositiveInteger(raw.limitCount) ?? 100 : null;
  const isbn =
    typeof raw.isbn === "string" ? extractIsbnCandidate(raw.isbn) : null;

  const rawFormats = Array.isArray(raw.formats) ? raw.formats : [];
  const formats = PRINT_FORMAT_ORDER.filter((format) => rawFormats.includes(format));

  const softcoverPriceMinor = normalizePositiveInteger(raw.softcoverPriceMinor);
  const hardcoverPriceMinor = normalizePositiveInteger(raw.hardcoverPriceMinor);
  const priceCurrency =
    typeof raw.priceCurrency === "string" && ["SEK", "EUR", "USD"].includes(raw.priceCurrency.toUpperCase())
      ? raw.priceCurrency.toUpperCase()
      : "SEK";

  if (enabled && formats.length === 0) {
    return {
      enabled,
      formats: ["softcover"],
      editionLimit,
      limitCount,
      isbn,
      softcoverPriceMinor,
      hardcoverPriceMinor,
      priceCurrency,
    };
  }

  return {
    enabled,
    formats,
    editionLimit,
    limitCount,
    isbn,
    softcoverPriceMinor,
    hardcoverPriceMinor,
    priceCurrency,
  };
}

export function extractIsbnCandidate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const matches = value.match(/97[89][0-9\-\s]{9,16}[0-9]/g) ?? [];
    for (const match of matches) {
      const normalized = match.replace(/\D/g, "");
      if (/^\d{13}$/.test(normalized)) return normalized;
    }

    const digitGroups = value.match(/\d{13}/g) ?? [];
    if (digitGroups[0]) return digitGroups[0];
  }
  return null;
}

export function roundUpToEven(value: number): number {
  const rounded = Math.max(0, Math.ceil(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function estimatePrintInteriorPages(totalWordCount: number, chapterCount: number): number {
  if (!Number.isFinite(totalWordCount) || totalWordCount <= 0) return 0;
  const estimatedTextPages = Math.ceil(totalWordCount / CPI_POD_PRINT_SPEC.wordsPerPage);
  const frontMatterPages = chapterCount > 0 ? CPI_POD_PRINT_SPEC.frontMatterPages : 4;
  return roundUpToEven(Math.max(CPI_POD_PRINT_SPEC.minPageCount, estimatedTextPages + frontMatterPages));
}

export function buildPrintFileStem(title: string, fallbackId: string): string {
  const normalized = title
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) return normalized;
  const fallback = fallbackId.split("-")[0]?.trim().toLowerCase();
  return fallback || "book";
}

export function buildPrintChecklist(input: {
  isbn: string | null;
  hasCoverImage: boolean;
  hasInteriorContent: boolean;
  totalExtent: number;
  isPublished: boolean;
}): PrintChecklistItem[] {
  const { isbn, hasCoverImage, hasInteriorContent, totalExtent, isPublished } = input;

  return [
    {
      label: "ISBN / EAN",
      description: isbn
        ? `CPI payload can use ${isbn}.`
        : "No 13-digit ISBN was found in the current book metadata.",
      status: isbn ? "ready" : "missing",
    },
    {
      label: "Cover art",
      description: hasCoverImage
        ? "Cover artwork exists and can be exported to a print wrap PDF."
        : "Add a cover so barcode position and lamination can be finalized.",
      status: hasCoverImage ? "ready" : "missing",
    },
    {
      label: "Interior manuscript",
      description: hasInteriorContent
        ? "Manuscript has readable content and can be turned into a book block PDF."
        : "Write or import manuscript content before preparing print files.",
      status: hasInteriorContent ? "ready" : "missing",
    },
    {
      label: "Page extent",
      description:
        totalExtent > 0
          ? `Estimated at ${totalExtent} interior pages with front matter included.`
          : "Page count is calculated from manuscript content.",
      status: totalExtent >= CPI_POD_PRINT_SPEC.minPageCount ? "ready" : totalExtent > 0 ? "review" : "missing",
    },
    {
      label: "Commercial state",
      description: isPublished
        ? "The reader version is already published."
        : "Drafts can be prepared for print, but distribution is easier to review once the title is published.",
      status: isPublished ? "ready" : "review",
    },
  ];
}

export function buildCpiMasteringPreview(input: MasteringPreviewInput): string {
  const { title, author, isbn, totalExtent, fileStem } = input;
  const exportStem = isbn ?? fileStem;
  const resolvedExtent = totalExtent > 0 ? String(totalExtent) : "[set-total-extent]";

  return [
    "<CPI>",
    "  <!-- Header fields are injected when the export endpoint is wired. -->",
    "  <Title>",
    `    <Type>${CPI_POD_PRINT_SPEC.type}</Type>`,
    `    <ISBN>${escapeXml(isbn ?? "[set-isbn]")}</ISBN>`,
    `    <Author>${escapeXml(author)}</Author>`,
    `    <Title>${escapeXml(title)}</Title>`,
    `    <Height>${CPI_POD_PRINT_SPEC.heightMm}</Height>`,
    `    <Width>${CPI_POD_PRINT_SPEC.widthMm}</Width>`,
    `    <BookType>${CPI_POD_PRINT_SPEC.bookType}</BookType>`,
    `    <Backing>${CPI_POD_PRINT_SPEC.backing}</Backing>`,
    "    <Cover>",
    `      <Pages>${CPI_POD_PRINT_SPEC.coverPages}</Pages>`,
    `      <Lamination>${CPI_POD_PRINT_SPEC.lamination}</Lamination>`,
    `      <PaperName>${CPI_POD_PRINT_SPEC.coverPaperName}</PaperName>`,
    `      <FileName>${escapeXml(`${exportStem}_Cover.pdf`)}</FileName>`,
    `      <BarcodePosition>${CPI_POD_PRINT_SPEC.barcodePosition}</BarcodePosition>`,
    "    </Cover>",
    "    <Text>",
    `      <TotalExtent>${resolvedExtent}</TotalExtent>`,
    `      <ColourPages>${CPI_POD_PRINT_SPEC.colourPages}</ColourPages>`,
    "      <ColourPagesPosition></ColourPagesPosition>",
    `      <HeadTailBand>${CPI_POD_PRINT_SPEC.headTailBand}</HeadTailBand>`,
    `      <Ribbon>${CPI_POD_PRINT_SPEC.ribbon}</Ribbon>`,
    `      <PaperName>${CPI_POD_PRINT_SPEC.textPaperName}</PaperName>`,
    `      <FileName>${escapeXml(`${exportStem}_Bookblock.pdf`)}</FileName>`,
    "    </Text>",
    "  </Title>",
    "</CPI>",
  ].join("\n");
}
