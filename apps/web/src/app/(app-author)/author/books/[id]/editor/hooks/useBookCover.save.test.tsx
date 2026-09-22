import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Book } from "../BookEditorView.types";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), update: vi.fn(), user: vi.fn(), refresh: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/toast", () => ({ useToastHelpers: () => ({ success: mocks.success }) }));
vi.mock("@/lib/supabase/storage", () => ({ uploadBookCover: mocks.upload }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: mocks.user }, from: () => ({ update: () => ({ eq: mocks.update }) }) }) }));
const { useBookCover } = await import("./useBookCover");
function handlers() {
  const capture = vi.fn<(value: ReturnType<typeof useBookCover>) => void>();
  function Probe() { capture(useBookCover({ book: { id: "fixture", cover_image: null } as Book })); return null; }
  renderToStaticMarkup(<Probe />);
  return capture.mock.calls[0][0];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "author" } } });
  mocks.upload.mockResolvedValue({ url: "https://example.test/cover.png" });
  mocks.update.mockResolvedValue({ error: null });
});
it("rejects a failed upload so the editor keeps edits open", async () => {
  mocks.upload.mockResolvedValue({ error: "failed" });
  await expect(handlers().handleEditorSave(new File(["image"], "cover.png"))).rejects.toThrow("save");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects a failed book update instead of confirming the editor save", async () => {
  mocks.update.mockResolvedValue({ error: "conflict" });
  await expect(handlers().handleEditorSave(new File(["image"], "cover.png"))).rejects.toThrow("save");
  expect(mocks.success).not.toHaveBeenCalled();
});
it("confirms only a successful cover save", async () => {
  await handlers().handleEditorSave(new File(["image"], "cover.png"));
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
