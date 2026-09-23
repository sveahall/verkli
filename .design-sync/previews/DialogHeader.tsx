import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@verkli/web";

const noop = () => {};

// DialogHeader is a layout slot — an empty box on its own, so the only true
// preview is the header inside a real Dialog.
export function InDialog() {
  return (
    <Dialog open onOpenChange={noop}>
      <DialogHeader>
        <DialogTitle>Publish to the store</DialogTitle>
        <DialogDescription>
          Your book becomes visible to readers immediately after publishing.
        </DialogDescription>
      </DialogHeader>
    </Dialog>
  );
}
