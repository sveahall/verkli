import { Card, CardContent, CardHeader } from "@verkli/web";

// CardContent is the padded body slot — empty on its own, previewed in a real Card.
export function InCard() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <h3 className="text-section-title">This month</h3>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          <div className="flex items-center justify-between">
            <dt className="text-label">Copies sold</dt>
            <dd className="text-body">184</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-label">Audiobook listens</dt>
            <dd className="text-body">1 032</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-label">Royalties</dt>
            <dd className="text-body">4 812 kr</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
