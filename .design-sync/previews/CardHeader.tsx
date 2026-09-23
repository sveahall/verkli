import { Badge, Card, CardContent, CardHeader } from "@verkli/web";

// CardHeader is a layout slot with a bottom border — empty on its own, so it is
// previewed inside a real Card.
export function InCard() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-section-title">Winter Light</h3>
          <Badge variant="warning">In review</Badge>
        </div>
        <p className="text-caption">8 chapters · submitted 3 days ago</p>
      </CardHeader>
      <CardContent>
        <p className="text-body">Our reviewers are checking formatting and metadata.</p>
      </CardContent>
    </Card>
  );
}
