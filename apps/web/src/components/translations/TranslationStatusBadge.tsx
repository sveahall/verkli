type TranslationStatus = "pending" | "translating" | "completed" | "failed";

const STATUS_CONFIG: Record<TranslationStatus, { label: string; className: string }> = {
  pending: {
    label: "Väntar",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
  },
  translating: {
    label: "Översätts",
    className: "animate-pulse bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  },
  completed: {
    label: "Klar",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  },
  failed: {
    label: "Misslyckades",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  },
};

export default function TranslationStatusBadge({ status }: { status: TranslationStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${config.className}`}
      role="status"
    >
      {config.label}
    </span>
  );
}

export type { TranslationStatus };
