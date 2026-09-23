import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle } from "@verkli/web";

const noop = () => {};

// DialogFooter right-aligns actions with a gap. Shown inside a real Dialog —
// alone it renders an empty flex row.
export function InDialog() {
  return (
    <Dialog open onOpenChange={noop}>
      <DialogHeader>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" size="sm">Keep editing</Button>
        <Button variant="secondary" size="sm">Save draft</Button>
        <Button variant="destructive" size="sm">Discard</Button>
      </DialogFooter>
    </Dialog>
  );
}
