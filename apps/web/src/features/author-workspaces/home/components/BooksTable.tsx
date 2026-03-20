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
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        status === "Published"
          ? "bg-green-100 text-green-700"
          : "bg-slate-100 text-slate-600"
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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="border-slate-200">
              <tr>
                <TableHead className="py-3 text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Title
                </TableHead>
                <TableHead className="py-3 text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Type
                </TableHead>
                <TableHead className="py-3 text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Status
                </TableHead>
                <TableHead className="py-3 text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Readers
                </TableHead>
                <TableHead className="py-3 text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Updated
                </TableHead>
                <TableHead className="py-3 text-right text-sm font-semibold normal-case tracking-normal text-slate-900">
                  Actions
                </TableHead>
              </tr>
            </TableHeader>

            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-transparent">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-xs font-semibold text-white",
                          COVER_TONES[index % COVER_TONES.length]
                        )}
                      >
                        {getInitials(item.title)}
                      </div>

                      <Link
                        href={item.href}
                        className="text-sm font-medium text-slate-900 transition hover:text-[#7C6CFF]"
                      >
                        {item.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-700">
                    {item.type}
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-700">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-700">
                    {item.readers}
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-700">
                    {item.updated}
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <Link
                      href={item.href}
                      aria-label={`Open ${item.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-8 text-sm text-slate-600">
          Create your first book.
        </div>
      )}
    </section>
  );
}
