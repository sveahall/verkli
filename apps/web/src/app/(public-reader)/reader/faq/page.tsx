import { permanentRedirect } from "next/navigation";

/**
 * `/reader/faq` used to re-render the reader marketing landing page, so a reader
 * who clicked "FAQ" got the sales pitch and no answers. There is now one
 * canonical reader help surface — `/support` — carrying the questions this route
 * promised plus a contact form, so this redirects there rather than duplicating
 * the content in two places that can drift apart.
 *
 * `sitemap.ts` still lists this URL; a 308 keeps that entry honest for crawlers
 * and for any bookmark already pointing here.
 */
export default function ReaderFaqPage(): never {
  permanentRedirect("/support");
}
