/** Statuses the import worker is still working. A second click must join these. */
export const IN_FLIGHT_IMPORT_STATUSES = ["pending", "extracting"] as const;

/** A worker that has not touched the row for this long is treated as stuck. */
export const IN_FLIGHT_IMPORT_IDLE_MS = 15 * 60 * 1000;

export function selectInFlightImport<T extends { id: string; status: string; updated_at: string }>(
  rows: T[],
  now = Date.now(),
): T | null {
  const fresh = rows
    .filter((row) => (IN_FLIGHT_IMPORT_STATUSES as readonly string[]).includes(row.status))
    .filter((row) => {
      const updated = new Date(row.updated_at).getTime();
      return Number.isFinite(updated) && now - updated >= 0 && now - updated < IN_FLIGHT_IMPORT_IDLE_MS;
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  return fresh[0] ?? null;
}
