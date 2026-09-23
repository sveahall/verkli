import { Textarea } from "@verkli/web";

export function Default() {
  return (
    <div className="max-w-md">
      <Textarea
        defaultValue={"A retired keeper returns to the island that raised him, and finds the light still burning for someone else.\n\nA quiet novel about repair."}
      />
    </div>
  );
}

export function Placeholder() {
  return (
    <div className="max-w-md">
      <Textarea placeholder="Write the book description readers will see on the store page…" />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="max-w-md">
      <Textarea invalid defaultValue="Too short." />
    </div>
  );
}

export function Resizable() {
  return (
    <div className="max-w-md">
      <Textarea
        rows={8}
        defaultValue={"Chapter 1 — The keeper returns\n\nThe ferry docked at dusk. He had not been back in nineteen years, and the island had not waited for him."}
      />
    </div>
  );
}
