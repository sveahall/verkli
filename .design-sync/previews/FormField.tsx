import { FormField, Input, Textarea } from "@verkli/web";

export function WithHelper() {
  return (
    <div className="max-w-md">
      <FormField label="Book title" required helper="Shown on the store page and the cover.">
        <Input defaultValue="The Lighthouse at Vinga" />
      </FormField>
    </div>
  );
}

export function WithDescriptionAndOptional() {
  return (
    <div className="max-w-md">
      <FormField
        label="Series"
        optional
        description="Group this book with others so readers can follow the whole series."
      >
        <Input placeholder="e.g. The Coast Trilogy" />
      </FormField>
    </div>
  );
}

export function WithError() {
  return (
    <div className="max-w-md">
      <FormField label="Description" required error="A description of at least 50 characters is required.">
        <Textarea invalid defaultValue="Too short." />
      </FormField>
    </div>
  );
}
