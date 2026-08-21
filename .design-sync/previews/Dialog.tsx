import { Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@verkli/web";

const noop = () => {};

export function ConfirmDestructive() {
  return (
    <Dialog open onOpenChange={noop}>
      <DialogHeader>
        <DialogTitle>Delete “The Lighthouse at Vinga”?</DialogTitle>
        <DialogDescription>
          This removes the book, its 12 chapters and the generated audiobook. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" size="sm">Cancel</Button>
        <Button variant="destructive" size="sm">Delete book</Button>
      </DialogFooter>
    </Dialog>
  );
}
