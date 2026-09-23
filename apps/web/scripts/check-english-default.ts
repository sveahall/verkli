import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

type Violation = {
  file: string;
  line: number;
  text: string;
};

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

const SCOPE = [
  "app/(app-reader)",
  "app/(reader-browse)",
  "app/(public-reader)",
  "app/error.tsx",
  "app/global-error.tsx",
  "components/reader",
  "components/messages",
  "components/clubs",
  "components/navbar",
  "components/notifications",
  "components/offline",
  "components/ui/ErrorBanner.tsx",
  // Author surfaces. These were outside the gate, which is how "Inga
  // försäljningar ännu." sat in the dashboard's empty state next to an English
  // heading. Hardcoded Swedish is always a mistake here: authors who want
  // Swedish get it from useAuthorLocale() keys in lib/author-locale.tsx, which
  // this scope does not touch.
  "app/(app-author)",
  "app/(public-author)",
  "components/author",
  "features/author",
  "features/author-workspaces",
];

const ALLOWED_EXACT = new Set([
  "sv-SE",
  "sv",
]);

// Reviewed book excerpts, not interface copy. Keep scanning this file so new
// non-English UI strings still fail the gate. Changes to excerpts need review.
const SAMPLE_CONTENT_PATH = "features/author/author-experience-data.ts";
const ALLOWED_SAMPLE_CONTENT = new Set([
  "Den hemsökta dagboken",
  "Jag försökte stänga den. Pärmen vägrade.",
  "Den första gången jag öppnade dagboken var det inte mitt eget bläck som rörde sig över sidan. Orden formade sig långsamt, som om någon på andra sidan väggen skrev medan jag tittade på. Jag försökte stänga den. Pärmen vägrade.",
  "Beim ersten Öffnen des Tagebuchs war es nicht meine eigene Tinte, die über die Seite glitt. Die Wörter bildeten sich langsam, als schriebe jemand auf der anderen Seite der Wand, während ich zusah. Ich versuchte, es zu schließen. Der Deckel weigerte sich.",
]);

const SWEDISH_CHARS = /[ÅÄÖåäö]/;
const SWEDISH_WORDS =
  /\b(?:författ\w*|ansök\w*|väntar|laddar|skicka\w*|öppna|böcker?|meddel\w*|nyhetsbrev|klubb\w*|abonnemang|inställ\w*|föregående|nästa|något|försök|logga(?:\s+ut)?|utforska|offentlig|privat|ägare|läsare|översätt\w*|språk|kapitel)\b/i;

function isCodeFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

function shouldSkipFile(filePath: string): boolean {
  return (
    filePath.endsWith(".d.ts") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("__tests__") ||
    filePath.includes("/lib/i18n/")
  );
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isSwedishCopyCandidate(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ALLOWED_EXACT.has(normalized)) return false;
  return SWEDISH_CHARS.test(normalized) || SWEDISH_WORDS.test(normalized);
}

function isImportString(node: ts.StringLiteralLike): boolean {
  const p = node.parent;
  return (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    (ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent))
  );
}

async function collectFiles(targetPath: string): Promise<string[]> {
  const resolved = path.join(SRC_ROOT, targetPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return isCodeFile(resolved) ? [resolved] : [];
  }

  const out: string[] = [];
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && isCodeFile(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function addViolation(
  sourceFile: ts.SourceFile,
  position: number,
  rawText: string,
  violations: Violation[]
): void {
  if (!isSwedishCopyCandidate(rawText)) return;
  if (
    path.relative(SRC_ROOT, sourceFile.fileName).split(path.sep).join("/") === SAMPLE_CONTENT_PATH &&
    ALLOWED_SAMPLE_CONTENT.has(rawText)
  ) return;
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  violations.push({
    file: path.relative(PROJECT_ROOT, sourceFile.fileName),
    line: line + 1,
    text: normalizeText(rawText),
  });
}

function scanSourceFile(sourceFile: ts.SourceFile): Violation[] {
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      if (!isImportString(node)) {
        addViolation(sourceFile, node.getStart(sourceFile), node.text, violations);
      }
    } else if (ts.isTemplateExpression(node)) {
      addViolation(sourceFile, node.head.getStart(sourceFile), node.head.text, violations);
      for (const span of node.templateSpans) {
        addViolation(sourceFile, span.literal.getStart(sourceFile), span.literal.text, violations);
      }
    } else if (ts.isJsxText(node)) {
      addViolation(sourceFile, node.getStart(sourceFile), node.getText(sourceFile), violations);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

async function main(): Promise<void> {
  const files = (
    await Promise.all(SCOPE.map((targetPath) => collectFiles(targetPath)))
  ).flat();

  const uniqueFiles = [...new Set(files)].filter((f) => !shouldSkipFile(f));
  const allViolations: Violation[] = [];

  for (const file of uniqueFiles) {
    const content = await fs.readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    allViolations.push(...scanSourceFile(sourceFile));
  }

  if (allViolations.length > 0) {
    console.error(`Found ${allViolations.length} non-English copy candidate(s):`);
    for (const v of allViolations) {
      console.error(`- ${v.file}:${v.line} -> ${v.text}`);
    }
    process.exit(1);
  }

  console.log("check:english-default ok");
}

void main();
