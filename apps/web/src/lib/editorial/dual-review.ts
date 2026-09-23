/**
 * Second reader for the manuscript review.
 *
 * Anthropic already wrote a report. OpenAI reads the same chapter and may
 * flag spelling, grammar and awkward phrasing the first reader missed. The
 * merge keeps both sets. A passage both readers quote is marked important.
 * Anything that does not appear verbatim in the chapter is dropped, so a
 * hallucinated quote never reaches the author.
 */

import type { MeterContext } from "@/lib/usage/types";
import { callOpenAi, type OpenAiJsonSchema } from "@/lib/ai/providers/openai";
import { editorialReportSchema, type EditorialReport, type ReviewMode } from "./review-schema";

const outputSchema: OpenAiJsonSchema = {
  name: "editorial_report",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "findings", "corrections"],
    properties: {
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "severity", "explanation", "quote"],
          properties: {
            category: { type: "string", enum: ["spelling", "grammar", "style", "plot", "characters", "pacing", "translation", "consistency"] },
            severity: { type: "string", enum: ["suggestion", "important"] },
            explanation: { type: "string" },
            quote: { type: "string" },
          },
        },
      },
      corrections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["original", "replacement", "reason"],
          properties: {
            original: { type: "string" },
            replacement: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    },
  },
};

const BOTH = " Both readers flagged this.";

function sameSpan(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 12 && longer.includes(shorter);
}

function noteAgreement(explanation: string): string {
  if (explanation.includes(BOTH.trim())) return explanation;
  const next = `${explanation}${BOTH}`;
  return next.length <= 1500 ? next : explanation;
}

export function mergeEditorialReports(first: EditorialReport, second: EditorialReport, text: string): EditorialReport {
  const findings = first.findings.filter((finding) => !finding.quote || text.includes(finding.quote));
  const corrections = first.corrections.filter((correction) => text.includes(correction.original));

  for (const finding of second.findings) {
    if (finding.quote && !text.includes(finding.quote)) continue;
    if (findings.length >= 25) break;
    const match = findings.find((existing) =>
      existing.category === finding.category && sameSpan(existing.quote, finding.quote)
    );
    if (match) {
      match.severity = "important";
      match.explanation = noteAgreement(match.explanation);
      continue;
    }
    if (!finding.quote && findings.some((existing) => !existing.quote && existing.explanation === finding.explanation)) {
      continue;
    }
    findings.push(finding);
  }

  for (const correction of second.corrections) {
    if (!text.includes(correction.original) || corrections.length >= 25) continue;
    if (corrections.some((existing) => sameSpan(existing.original, correction.original))) continue;
    corrections.push(correction);
  }

  let summary = first.summary;
  const firstCount = first.findings.length + first.corrections.length;
  const mergedCount = findings.length + corrections.length;
  if (mergedCount > firstCount && summary.length + 56 <= 4000) {
    summary = `${summary} A second reader flagged additional passages.`;
  }

  return editorialReportSchema.parse({ summary, findings, corrections });
}

export async function reviewWithOpenAi(input: {
  mode: ReviewMode;
  text: string;
  chapterTitle: string;
  sourceText: string | null;
  meter?: MeterContext;
}, system: string): Promise<EditorialReport | null> {
  try {
    const { meter, ...chapter } = input;
    const raw = await callOpenAi({
      system,
      user: JSON.stringify(chapter),
      maxTokens: 6000,
      timeoutMs: 45_000,
      schema: outputSchema,
      meter,
    });
    return editorialReportSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")));
  } catch {
    console.warn("[editorial] second reader unavailable, keeping the first report");
    return null;
  }
}
