// design-sync shim for `next/navigation`.
//
// WHY: ErrorBanner.tsx imports useSearchParams/useRouter/usePathname. Same root
// cause as the next/link shim — the real module pulls Next's client router and
// its module-scope `process.env` access, which kills the whole bundle.
//
// Reads real browser location so a preview can still drive state via the card
// URL; navigation is inert because a preview card has nowhere to navigate to.
const search = () =>
  new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

export function useSearchParams() {
  return search();
}

export function usePathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

const noop = () => {};
const router = {
  push: noop,
  replace: noop,
  back: noop,
  forward: noop,
  refresh: noop,
  prefetch: () => Promise.resolve(),
};

export function useRouter() {
  return router;
}

export function useParams() {
  return {};
}

export function redirect() {}
export function notFound() {}
