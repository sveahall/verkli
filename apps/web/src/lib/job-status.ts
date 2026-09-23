export type JobStatus = "pending" | "running" | "failed" | "completed";

export function normalizeJobStatus(raw: string | null | undefined): JobStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "pending" || value === "queued") return "pending";
  if (
    value === "running" ||
    value === "processing" ||
    value === "extracting" ||
    value === "translating" ||
    value === "generating"
  ) {
    return "running";
  }
  if (value === "failed" || value === "error" || value === "cancelled" || value === "canceled") {
    return "failed";
  }
  if (value === "completed" || value === "done" || value === "generated" || value === "published") {
    return "completed";
  }
  return "pending";
}

export function isJobActiveStatus(raw: string | null | undefined): boolean {
  const normalized = normalizeJobStatus(raw);
  return normalized === "pending" || normalized === "running";
}

export function isTerminalJobStatus(raw: string | null | undefined): boolean {
  const normalized = normalizeJobStatus(raw);
  return normalized === "completed" || normalized === "failed";
}
