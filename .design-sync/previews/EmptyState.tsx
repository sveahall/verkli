import { Button, EmptyState } from "@verkli/web";

export function Default() {
  return (
    <EmptyState
      title="No books yet"
      description="Import a manuscript or start from a blank page — your library will show up here."
    />
  );
}

export function WithAction() {
  return (
    <EmptyState
      title="No books yet"
      description="Import a manuscript or start from a blank page."
      action={<Button size="sm">Import manuscript</Button>}
    />
  );
}

export function WithIcon() {
  return (
    <EmptyState
      icon={<span className="text-2xl">📚</span>}
      title="Your shelf is empty"
      description="Books you buy or follow will appear here."
      action={<Button size="sm" variant="secondary">Browse the store</Button>}
    />
  );
}
