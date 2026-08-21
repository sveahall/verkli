import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@verkli/web";

export function BookList() {
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
        <TableRow>
          <TableCell>The Lighthouse at Vinga</TableCell>
          <TableCell><Badge variant="success">Published</Badge></TableCell>
          <TableCell>12</TableCell>
          <TableCell>2 480 kr</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Winter Light</TableCell>
          <TableCell><Badge variant="warning">In review</Badge></TableCell>
          <TableCell>8</TableCell>
          <TableCell>—</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>What the Water Kept</TableCell>
          <TableCell><Badge variant="neutral">Draft</Badge></TableCell>
          <TableCell>3</TableCell>
          <TableCell>—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
