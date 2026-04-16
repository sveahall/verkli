import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type BooksTableItem = {
  id: string;
  title: string;
  href: string;
  type: "Shelf" | "Book";
  status: "Published" | "Draft";
  readers: string;
  updated: string;
};

const COVER_TONES = [
  "from-slate-900 to-slate-700",
  "from-[#F7B267] to-[#F4845F]",
  "from-[#5C7AEA] to-[#3552A5]",
  "from-[#AD91FF] to-[#7C6CFF]",
];

function getInitials(title: string) {
  return title
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function StatusBadge({ status }: { status: BooksTableItem["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[13px] font-medium",
        status === "Published"
          ? "bg-[#E7F8EE] text-[#17A161] dark:bg-[#17A161]/15 dark:text-[#4ADE80]"
          : "bg-[#F1F3F8] text-[#70788B] dark:bg-white/10 dark:text-white/50"
      )}
    >
      {status}
    </span>
  );
}

type BooksTableProps = {
  items: BooksTableItem[];
};

export default function BooksTable({ items }: BooksTableProps) {
  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] sm:px-7 sm:py-5 dark:bg-white/[0.04]">
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="border-0">
              <tr>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Title
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Type
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Status
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Readers
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Updated
                </TableHead>
                <TableHead className="py-2.5 text-right text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">
                  Actions
                </TableHead>
              </tr>
            </TableHeader>

            <TableBody className="divide-y-0">
              {items.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-transparent">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[11px] font-semibold text-white",
                          COVER_TONES[index % COVER_TONES.length]
                        )}
                      >
                        {getInitials(item.title)}
                      </div>

                      <Link
                        href={item.href}
                        className="text-sm font-medium text-slate-900 transition hover:text-[#7C6CFF] dark:text-white"
                      >
                        {item.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-slate-600 dark:text-white/60">
                    {item.type}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-slate-600 dark:text-white/60">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="py-2 text-sm text-slate-600 dark:text-white/60">
                    {item.readers}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-slate-600 dark:text-white/60">
                    {item.updated}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Link
                      href={item.href}
                      aria-label={`Open ${item.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-8 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/50">
          Create your first book.
        </div>
      )}
    </section>
  );
}
