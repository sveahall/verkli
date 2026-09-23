import { Breadcrumbs } from "@verkli/web";

export function ThreeLevels() {
  return (
    <Breadcrumbs
      items={[
        { label: "Library", href: "/author/library" },
        { label: "The Lighthouse at Vinga", href: "/author/books/lighthouse" },
        { label: "Chapter 3" },
      ]}
    />
  );
}

export function TwoLevels() {
  return (
    <Breadcrumbs
      items={[
        { label: "Admin", href: "/admin" },
        { label: "Feedback" },
      ]}
    />
  );
}

export function SingleLevel() {
  return <Breadcrumbs items={[{ label: "Settings" }]} />;
}
