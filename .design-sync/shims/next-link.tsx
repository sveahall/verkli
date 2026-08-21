// design-sync shim for `next/link`.
//
// WHY: breadcrumbs.tsx imports next/link. Bundling the real next/link drags in
// Next's client router (normalizePathTrailingSlash, addPathPrefix, …), which
// references `process.env.__NEXT_MANUAL_CLIENT_BASE_PATH` at module scope. One
// undefined `process` throws while the IIFE is evaluating, so window.VerkliUI is
// never assigned and ALL 41 components die — not just the Next-coupled ones.
//
// This is a host-environment shim, not a component reimplementation: next/link
// renders an <a href> into the DOM, which is exactly what this renders. The DS
// component under test (Breadcrumbs) is still the real shipped source.
import * as React from "react";

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  locale?: string | false;
};

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, scroll, prefetch, shallow, passHref, locale, ...rest },
  ref,
) {
  const url = typeof href === "string" ? href : (href?.pathname ?? "#");
  return <a ref={ref} href={url} {...rest} />;
});

export default Link;
