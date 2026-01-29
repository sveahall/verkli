export type NavVariant = "PUBLIC_AUTHOR" | "PUBLIC_READER" | "APP_AUTHOR" | "APP_READER";

export type NavLink = {
  label: string;
  href: string;
  hasDropdown?: boolean;
};

export type NavAction = {
  label: string;
  href: string;
};

export type NavActions = {
  primary?: NavAction;
  secondary?: NavAction;
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchHref?: string;
  showProfileMenu?: boolean;
};

export type NavConfig = {
  homeHref: string;
  links: NavLink[];
  actions: NavActions;
};

export const NAV_CONFIG: Record<NavVariant, NavConfig> = {
  PUBLIC_AUTHOR: {
    homeHref: "/",
    links: [
      { label: "Product", href: "/product" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Case studies", href: "/case-studies" },
      { label: "FAQ", href: "/faq" },
    ],
    actions: {
      secondary: { label: "Login", href: "/signin" },
      primary: { label: "Start free", href: "/signup" },
    },
  },
  PUBLIC_READER: {
    homeHref: "/reader",
    links: [
      { label: "Discover", href: "/reader" },
      { label: "How it works", href: "/reader/how-it-works" },
      { label: "Membership", href: "/reader/membership" },
      { label: "App", href: "/reader/app" },
      { label: "FAQ", href: "/reader/faq" },
    ],
    actions: {
      secondary: { label: "Login", href: "/reader/signin" },
      primary: { label: "Join", href: "/reader/signup" },
    },
  },
  APP_AUTHOR: {
    homeHref: "/writer",
    links: [
      { label: "My World", href: "/writer" },
      { label: "Books", href: "/writer/books" },
      { label: "Marketing Tools", href: "/writer/marketing" },
      { label: "Stats", href: "/writer/stats" },
      { label: "Community", href: "/writer/community" },
      { label: "Settings", href: "/writer/settings" },
    ],
    actions: {
      primary: { label: "Publish", href: "/writer/books" },
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/writer",
      showProfileMenu: true,
    },
  },
  APP_READER: {
    homeHref: "/reader/home",
    links: [
      { label: "Feed", href: "/reader/feed" },
      { label: "Discover", href: "/reader/discover" },
      { label: "Library", href: "/reader/library" },
      { label: "Bookmarks", href: "/reader/bookmarks" },
      { label: "Community", href: "/reader/community" },
      { label: "Profile", href: "/reader/profile" },
    ],
    actions: {
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/reader/home",
      showProfileMenu: true,
    },
  },
};
