import { Badge } from "@verkli/web";

export function SemanticVariants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">Draft</Badge>
      <Badge variant="success">Published</Badge>
      <Badge variant="warning">In review</Badge>
      <Badge variant="info">Scheduled</Badge>
      <Badge variant="error">Rejected</Badge>
      <Badge variant="brand">Beta</Badge>
    </div>
  );
}

// DESIGN.md rule #6: state is never colour-alone — the dot is on by default for
// semantic variants and can be forced on or off.
export function DotControl() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Dot by default</Badge>
      <Badge variant="success" dot={false}>Dot suppressed</Badge>
      <Badge variant="neutral" dot>Dot forced on</Badge>
    </div>
  );
}

export function WithIcon() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="info" icon={<span>♪</span>}>Audiobook</Badge>
      <Badge variant="brand" icon={<span>✦</span>}>AI translated</Badge>
      <Badge variant="warning" icon={<span>!</span>}>Needs cover</Badge>
    </div>
  );
}
