import { Button, Card, CardContent, CardFooter } from "@verkli/web";

// CardFooter is the bottom action slot with a top border — empty on its own.
export function InCard() {
  return (
    <Card className="max-w-md">
      <CardContent>
        <p className="text-label">Ready to publish</p>
        <p className="text-body">
          All 12 chapters have a title and the cover meets the minimum resolution.
        </p>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-center justify-between">
          <span className="text-caption">Last checked just now</span>
          <Button size="sm">Publish book</Button>
        </div>
      </CardFooter>
    </Card>
  );
}
