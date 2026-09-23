import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@verkli/web";

// TableCell is a <td>; alone it renders an empty cell, so this shows it in a real row.
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
        <TableRow>
          <TableCell>2 · Winter light</TableCell>
          <TableCell>2 987</TableCell>
          <TableCell>Queued</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
