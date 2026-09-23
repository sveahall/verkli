import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Preview from "./Preview";
it("shows a labelled local demo with chapter and profile empty states", () => {
  const html = renderToStaticMarkup(<Preview />);
  expect(html).toContain("Chapter illustrations");
  expect(html).toContain("not saved to a real book");
  expect(html).toContain("Choose a chapter");
  expect(html).toContain("Choose a style");
});
