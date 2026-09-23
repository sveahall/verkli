import { Button } from "@verkli/web";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Publish book</Button>
      <Button variant="secondary">Save draft</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Delete book</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Add chapter">
        +
      </Button>
    </div>
  );
}

export function LoadingAndDisabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button isLoading loadingText="Generating audiobook…">Generate audiobook</Button>
      <Button variant="secondary" isLoading>Uploading</Button>
      <Button disabled>Publish book</Button>
      <Button variant="secondary" disabled>Save draft</Button>
    </div>
  );
}

export function FullWidth() {
  return (
    <div className="max-w-sm space-y-3">
      <Button fullWidth>Continue to checkout</Button>
      <Button fullWidth variant="secondary">Keep reading later</Button>
    </div>
  );
}
