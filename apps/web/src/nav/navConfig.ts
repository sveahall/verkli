export type NavVariant = "PUBLIC_AUTHOR" | "PUBLIC_READER" | "APP_AUTHOR" | "APP_READER";

/** MVP: read-write-publish only. Set false to enable Community + Marketing Tools. */
const MVP_MODE = true;

export type NavLinkChild = {
  label: string;
  href: string;
};

export type NavLink = {
  label: string;
  href: string;
  hasDropdown?: boolean;
  children?: NavLinkChild[];
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
    homeHref: "/author",
    links: [
      {
        label: "Product",
        href: "/product",
        hasDropdown: true,
        children: [
          { label: "Product", href: "/product" },
          { label: "How it works", href: "/how-it-works" },
        ],
      },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
    ],
    actions: {
      secondary: { label: "Login", href: "/author/signin" },
      primary: { label: "Join now", href: "/author/signup" },
    },
  },
  PUBLIC_READER: {
    homeHref: "/reader",
    links: [
      { label: "Discover", href: "/reader" },
    ],
    actions: {
      secondary: { label: "Login", href: "/reader/signin" },
      primary: { label: "Join", href: "/reader/signup" },
    },
  },
  APP_AUTHOR: {
    homeHref: "/author/home",
    links: [
      {
        label: "My World",
        href: "/author/home",
        hasDropdown: true,
        children: [
          { label: "Overview", href: "/author/home" },
          { label: "Stats", href: "/author/stats" },
          { label: "Profile preview", href: "/author/profile" },
          { label: "TTS Lab", href: "/author/tts-lab" },
        ],
      },
      { label: "Books", href: "/author/books" },
      { label: "Marketing Portal", href: "/author/marketing" },
      ...(MVP_MODE ? [] : [
        {
          label: "Marketing Tools",
          href: "/author/marketing",
          hasDropdown: true,
          children: [
            { label: "Overview", href: "/author/marketing" },
            { label: "AI tools", href: "/author/marketing" },
            { label: "Automations", href: "/author/marketing" },
            { label: "Distribution", href: "/author/marketing" },
          ],
        } as NavLink,
        { label: "Community", href: "/author/polls" },
      ]),
    ],
    actions: {
      primary: { label: "Books", href: "/author/books" },
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/author/home",
      showProfileMenu: true,
    },
  },
  APP_READER: {
    homeHref: "/reader/home",
    links: [
      { label: "Home", href: "/reader/home" },
      {
        label: "Discover",
        href: "/reader/discover",
        hasDropdown: true,
        children: [
          { label: "Discover", href: "/reader/discover" },
          { label: "Genres", href: "/reader/genres" },
          { label: "Authors", href: "/reader/authors" },
        ],
      },
      {
        label: "Library",
        href: "/reader/library",
        hasDropdown: true,
        children: [
          { label: "My library", href: "/reader/library" },
          { label: "Bookmarks", href: "/reader/bookmarks" },
          { label: "Continue reading", href: "/reader/home" },
        ],
      },
      ...(MVP_MODE ? [] : [{ label: "Community", href: "/reader/clubs" }]),
    ],
    actions: {
      primary: { label: "Become an author", href: "/author/signup" },
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/reader/home",
      showProfileMenu: true,
    },
  },
};
