import { Button, PageHeader } from "@verkli/web";

// Ported from the app's own usage — apps/web/src/app/admin/page.tsx.
export function Default() {
  return (
    <PageHeader
      eyebrow="Admin"
      title="Dashboard"
      description="Platform health, moderation queue and operational overview."
    />
  );
}

export function WithActions() {
  return (
    <PageHeader
      eyebrow="Library"
      title="My books"
      description="Everything you have written, imported or published on Verkli."
      actions={
        <>
          <Button variant="secondary" size="sm">Import manuscript</Button>
          <Button size="sm">New book</Button>
        </>
      }
    />
  );
}

export function TitleOnly() {
  return <PageHeader title="Settings" />;
}
