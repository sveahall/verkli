import { LoadingState } from "@verkli/web";

export function Default() {
  return <LoadingState />;
}

export function WithTitleAndDescription() {
  return (
    <LoadingState
      title="Importing manuscript"
      description="Splitting your document into chapters — this usually takes a minute."
    />
  );
}

export function MoreLines() {
  return <LoadingState title="Loading chapters" lines={6} />;
}
