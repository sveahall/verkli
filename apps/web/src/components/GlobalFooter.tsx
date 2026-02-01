"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";

/**
 * Renders the shared Footer with variant based on current route.
 * author routes get author variant, everything else gets reader variant.
 */
export default function GlobalFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  const variant = pathname?.startsWith("/author") ? "author" : "reader";
  return <Footer variant={variant} />;
}
