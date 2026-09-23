import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("./PreparationPanel", () => ({ default: () => <p>Local image workspace</p> }));
import AuthorPreparation, { watchOwner } from "./AuthorPreparation";
it("keeps local image controls unmounted before owner verification", () => {
  const html = renderToStaticMarkup(<AuthorPreparation ownerId="owner" />);
  expect(html).not.toContain("Local image workspace"); expect(html).toContain("Verifying your author session");
});
it("clears the verified owner on signout/account switch and ignores late events after cleanup", () => {
  type Listener = Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0];
  let listener: Listener = async () => {}; const unsubscribe = vi.fn(); const update = vi.fn();
  const auth = { onAuthStateChange(callback: Listener) { listener = callback; return { data: { subscription: { unsubscribe } } }; } } as unknown as SupabaseClient["auth"];
  const stop = watchOwner(auth, "owner", update);
  const session = (id: string) => ({ user: { id } }) as Parameters<Listener>[1];
  listener("INITIAL_SESSION", session("owner")); listener("SIGNED_OUT", null); listener("SIGNED_IN", session("other"));
  expect(update.mock.calls).toEqual([["owner"], [null], [null]]);
  stop(); listener("SIGNED_IN", session("owner")); expect(update).toHaveBeenCalledTimes(3); expect(unsubscribe).toHaveBeenCalledOnce();
});
