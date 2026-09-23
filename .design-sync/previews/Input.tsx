import { Input } from "@verkli/web";

export function Sizes() {
  return (
    <div className="max-w-sm space-y-3">
      <Input inputSize="sm" placeholder="Small" defaultValue="The Lighthouse at Vinga" />
      <Input inputSize="md" placeholder="Medium" defaultValue="The Lighthouse at Vinga" />
      <Input inputSize="lg" placeholder="Large" defaultValue="The Lighthouse at Vinga" />
    </div>
  );
}

export function WithLabelAndHint() {
  return (
    <div className="max-w-sm space-y-4">
      <Input label="Book title" defaultValue="The Lighthouse at Vinga" />
      <Input label="ISBN" placeholder="978-91-…" hint="Optional — we generate one if you leave this blank." />
    </div>
  );
}

export function ErrorState() {
  return (
    <div className="max-w-sm">
      <Input label="Author email" defaultValue="svea@" error="Enter a valid email address." />
    </div>
  );
}

export function WithIconsAndPassword() {
  return (
    <div className="max-w-sm space-y-3">
      <Input startIcon={<span>@</span>} placeholder="svea@verkli.com" />
      <Input endIcon={<span>kr</span>} defaultValue="149" />
      <Input label="Password" type="password" defaultValue="correct-horse-battery" />
    </div>
  );
}
