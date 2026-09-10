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
  "from-[#30243b] to-[#17131d]",
  "from-[#6a455d] to-[#382c42]",
  "from-[#685979] to-[#35283e]",
  "from-[#79649b] to-[#574475]",
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
          : "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground"
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
    <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-[0_2px_10px_rgba(25,23,28,0.025)] sm:px-7 sm:py-5 dark:bg-card">
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="border-0">
              <tr>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Title
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Type
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Status
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Readers
                </TableHead>
                <TableHead className="py-2.5 text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Updated
                </TableHead>
                <TableHead className="py-2.5 text-right text-sm font-semibold normal-case tracking-normal text-foreground dark:text-foreground">
                  Actions
                </TableHead>
              </tr>
            </TableHeader>

            <TableBody className="divide-y-0">
              {items.map((item, index) => (
                <TableRow key={item.id} className="border-border/70 hover:bg-background/80">
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
                        className="text-sm font-medium text-foreground transition hover:text-accent-foreground dark:text-foreground"
                      >
                        {item.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground dark:text-muted-foreground">
                    {item.type}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground dark:text-muted-foreground">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground dark:text-muted-foreground">
                    {item.readers}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground dark:text-muted-foreground">
                    {item.updated}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Link
                      href={item.href}
                      aria-label={`Open ${item.title}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
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
        <div className="rounded-lg border border-dashed border-border bg-background/80 p-8 text-sm text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
          <p className="font-medium text-foreground">Your library starts here.</p>
          <p className="mt-1">Create a book to keep your manuscripts, readers and publishing progress together.</p>
        </div>
      )}
    </section>
  );
}
