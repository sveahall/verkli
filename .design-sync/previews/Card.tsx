import { Button, Card, CardContent, CardFooter, CardHeader } from "@verkli/web";

export function WithHeaderAndFooter() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <h3 className="text-section-title">The Lighthouse at Vinga</h3>
        <p className="text-caption">Draft · 12 chapters · last edited 2 hours ago</p>
      </CardHeader>
      <CardContent>
        <p className="text-body">
          A retired keeper returns to the island that raised him, and finds the light
          still burning for someone else.
        </p>
      </CardContent>
      <CardFooter>
        <div className="flex items-center gap-3">
          <Button size="sm">Continue writing</Button>
          <Button size="sm" variant="ghost">Preview</Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export function ContentOnly() {
  return (
    <Card className="max-w-md">
      <CardContent>
        <p className="text-label">Royalties this month</p>
        <p className="text-stat">4 812 kr</p>
        <p className="text-caption">Across 3 published titles</p>
      </CardContent>
    </Card>
  );
}

export function Subtle() {
  return (
    <Card variant="subtle" className="max-w-md">
      <CardContent>
        <p className="text-label">Import in progress</p>
        <p className="text-body">
          We are splitting your manuscript into chapters. This usually takes a minute.
        </p>
      </CardContent>
    </Card>
  );
}
