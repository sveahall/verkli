import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@verkli/web";

const noop = () => {};

// DialogBody is the padded content slot; shown inside a real Dialog because on
// its own it renders an empty box.
export function InDialog() {
  return (
    <Dialog open onOpenChange={noop}>
      <DialogHeader>
        <DialogTitle>Chapter import summary</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-body">
          We found 12 chapters in your manuscript. Chapter titles were taken from the
          heading style used in the document.
        </p>
        <ul className="mt-3 space-y-1 text-caption">
          <li>1 · The keeper returns</li>
          <li>2 · Winter light</li>
          <li>3 · What the water kept</li>
        </ul>
      </DialogBody>
    </Dialog>
  );
}
