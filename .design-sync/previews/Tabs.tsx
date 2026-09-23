import { useState } from "react";
import { Button, Tabs } from "@verkli/web";

const ITEMS = [
  { id: "all", label: "All books" },
  { id: "published", label: "Published", badge: "3" },
  { id: "drafts", label: "Drafts", badge: "12" },
  { id: "review", label: "In review", badge: "1" },
];

export function WithBadges() {
  const [active, setActive] = useState("published");
  return <Tabs items={ITEMS} active={active} onChange={setActive} />;
}

export function FirstSelected() {
  const [active, setActive] = useState("all");
  return <Tabs items={ITEMS} active={active} onChange={setActive} />;
}

export function WithActions() {
  const [active, setActive] = useState("drafts");
  return (
    <Tabs
      items={ITEMS.slice(0, 3)}
      active={active}
      onChange={setActive}
      actions={<Button size="sm">New book</Button>}
    />
  );
}
