import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
import SessionBoundary, { watchOwner } from "./SessionBoundary";
it("does not render private titles before browser session verification", () => {
  const html = renderToStaticMarkup(<SessionBoundary ownerId="owner"><p>Private book title</p></SessionBoundary>);
  expect(html).not.toContain("Private book title"); expect(html).toContain("Verifying your author session");
});
it("clears owner verification on signout or another account and ignores events after cleanup", () => {
  type Listener = Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0];
  let listener: Listener = () => {};
  const unsubscribe = vi.fn(); const update = vi.fn();
  const auth = { onAuthStateChange: (callback: Listener) => { listener = callback; return { data: { subscription: { unsubscribe } } }; } } as unknown as SupabaseClient["auth"];
  const stop = watchOwner(auth, "owner", update);
  const session = (id: string) => ({ user: { id } }) as Parameters<Listener>[1];
  listener("INITIAL_SESSION", session("owner")); listener("SIGNED_OUT", null); listener("SIGNED_IN", session("other")); listener("SIGNED_IN", session("owner"));
  expect(update.mock.calls).toEqual([["owner"], [null], [null], ["owner"]]);
  stop(); listener("SIGNED_IN", session("other")); expect(update).toHaveBeenCalledTimes(4); expect(unsubscribe).toHaveBeenCalledOnce();
});
