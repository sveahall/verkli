import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfflineSaveButton from "./OfflineSaveButton";

describe("offline saving unavailable", () => {
  it("explains online-only reading, permits cleanup, and offers no save or upgrade claim", () => {
    const html = renderToStaticMarkup(<OfflineSaveButton bookId="book" userId="reader" languageCode="en" />);
    expect(html).toContain("Offline downloads are temporarily unavailable");
    expect(html).toContain("require an internet connection");
    expect(html).toContain("Remove previously saved copies");
    expect(html).not.toContain("Save offline");
    expect(html).not.toContain("Saved offline");
    expect(html).not.toContain("Upgrade");
  });
});
