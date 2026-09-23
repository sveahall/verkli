import { Button, ErrorState } from "@verkli/web";

export function Default() {
  return (
    <ErrorState
      title="Could not load your library"
      description="Something went wrong on our side. Your books are safe."
    />
  );
}

export function WithRetry() {
  return (
    <ErrorState
      title="Audiobook generation failed"
      description="The narration job stopped after chapter 4. You can retry from where it stopped."
      action={<Button size="sm" variant="secondary">Retry generation</Button>}
    />
  );
}
