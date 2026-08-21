import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@verkli/web";

// TableHead is a <th>; it only renders meaningfully inside a real table head row.
export function InTable() {
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
        <TableRow>
          <TableCell>1 · The keeper returns</TableCell>
          <TableCell>3 412</TableCell>
          <TableCell>Ready</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
