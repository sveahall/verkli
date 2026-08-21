import { SearchInput } from "@verkli/web";

export function Default() {
  return (
    <div className="max-w-sm">
      <SearchInput placeholder="Search your library…" />
    </div>
  );
}

export function WithValue() {
  return (
    <div className="max-w-sm">
      <SearchInput defaultValue="lighthouse" />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="max-w-sm space-y-3">
      <SearchInput inputSize="sm" placeholder="Small" />
      <SearchInput inputSize="md" placeholder="Medium" />
      <SearchInput inputSize="lg" placeholder="Large" />
    </div>
  );
}
