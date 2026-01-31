export type NavVariant = "PUBLIC_AUTHOR" | "PUBLIC_READER" | "APP_AUTHOR" | "APP_READER";

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
          { label: "Case studies", href: "/case-studies" },
        ],
      },
      { label: "Pricing", href: "/pricing" },
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
      { label: "Membership", href: "/reader/membership" },
      {
        label: "App",
        href: "/reader/app",
        hasDropdown: true,
        children: [
          { label: "App overview", href: "/reader/app" },
          { label: "How it works", href: "/reader/how-it-works" },
        ],
      },
      { label: "FAQ", href: "/reader/faq" },
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
        ],
      },
      {
        label: "Books",
        href: "/author/books",
        hasDropdown: true,
        children: [
          { label: "All books", href: "/author/books" },
          { label: "Shelves", href: "/author/books" },
          { label: "Drafts", href: "/author/books" },
          { label: "Published", href: "/author/books" },
        ],
      },
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
      },
      { label: "Community", href: "/author/community" },
    ],
    actions: {
      primary: { label: "Publish", href: "/author/books" },
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/author/home",
      showProfileMenu: true,
    },
  },
  APP_READER: {
    homeHref: "/reader/home",
    links: [
      { label: "Feed", href: "/reader/feed" },
      {
        label: "Discover",
        href: "/reader/discover",
        hasDropdown: true,
        children: [
          { label: "Discover", href: "/reader/discover" },
          { label: "Explore books", href: "/reader/library" },
          { label: "Genres", href: "/reader/discover" },
          { label: "Authors", href: "/reader/discover" },
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
      { label: "Community", href: "/reader/community" },
      {
        label: "Profile",
        href: "/reader/profile",
        hasDropdown: false,
        children: [
          { label: "Profile", href: "/reader/profile" },
          { label: "Settings", href: "/reader/settings" },
        ],
      },
    ],
    actions: {
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/reader/home",
      showProfileMenu: true,
    },
  },
};
