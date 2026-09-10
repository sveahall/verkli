import { notFound, redirect } from "next/navigation";
import { isValidPanel } from "../editor/bookEditor.shared";

/**
 * `/author/books/<id>/cover` 404'd.
 *
 * The book workspace is one page that swaps panels on `?panel=`, but every
 * step in its own stepper reads like a route — Write, Cover, Audio, Translate,
 * Pricing, Publish, Review. Anyone who bookmarks a step, copies it out of the
 * address bar mid-flow, or types the obvious path gets a 404 instead of the
 * panel, and nothing tells them the real URL is a query string.
 *
 * This turns those paths into the query form. Unknown segments still 404, so
 * the surface does not silently widen: `/author/books/<id>/nonsense` is still
 * a mistake, not a redirect to the editor.
 *
 * Next resolves static segments before dynamic ones, so the real subroutes
 * (`write`, `settings`, `marketing`, `overview`, `editor`, `analytics`) keep
 * winning over this catch-all and are unaffected.
 */
export default async function BookPanelRedirect({
  params,
}: {
  params: Promise<{ id: string; panel: string }>;
}) {
  const { id, panel } = await params;
  if (!isValidPanel(panel)) notFound();
  redirect(`/author/books/${id}?panel=${panel}`);
}
