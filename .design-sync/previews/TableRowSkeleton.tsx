import { Table, TableBody, TableHead, TableHeader, TableRow, TableRowSkeleton } from "@verkli/web";

// TableRowSkeleton renders <td> placeholders, so it needs a real table around it.
export function InTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Chapters</TableHead>
          <TableHead>Royalties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRowSkeleton columns={4} />
        <TableRowSkeleton columns={4} />
        <TableRowSkeleton columns={4} />
      </TableBody>
    </Table>
  );
}

export function ThreeColumns() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chapter</TableHead>
          <TableHead>Words</TableHead>
          <TableHead>Audio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRowSkeleton columns={3} />
        <TableRowSkeleton columns={3} />
      </TableBody>
    </Table>
  );
}
