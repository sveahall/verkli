export type NavVariant = "PUBLIC_AUTHOR" | "PUBLIC_READER" | "APP_AUTHOR" | "APP_READER";

export type AuthorWorkflowKey =
  | "home"
  | "library"
  | "production"
  | "audience"
  | "analytics";

export type AuthorSidebarLink = {
  key: AuthorWorkflowKey | "profile" | "settings" | "switch-to-reader";
  label: string;
  href: string;
  icon: string;
  bookScoped?: boolean;
  children?: AuthorSidebarChildLink[];
};

export type AuthorSidebarChildLink = {
  key: string;
  label: string;
  href: string;
  bookScoped?: boolean;
};

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

export const AUTHOR_WORKFLOW_NAV: AuthorSidebarLink[] = [
  { key: "home", label: "Home", href: "/author/home", icon: "home" },
  { key: "library", label: "Library", href: "/author/library", icon: "library" },
  {
    key: "production",
    label: "Production",
    href: "/author/production",
    icon: "production",
    bookScoped: true,
    children: [
      { key: "assets", label: "Assets", href: "/author/production", bookScoped: true },
      {
        key: "audiobooks",
        label: "Audiobooks",
        href: "/author/production?kind=audiobook",
        bookScoped: true,
      },
      {
        key: "translations",
        label: "Translations",
        href: "/author/production?kind=translation",
        bookScoped: true,
      },
      {
        key: "exports",
        label: "Exports",
        href: "/author/production?kind=marketing",
        bookScoped: true,
      },
    ],
  },
  {
    key: "audience",
    label: "Marketing",
    href: "/author/audience",
    icon: "audience",
    bookScoped: true,
    children: [
      { key: "campaigns", label: "Campaigns", href: "/author/audience?surface=campaigns", bookScoped: true },
      {
        key: "reader-updates",
        label: "Reader updates",
        href: "/author/audience?surface=reader-updates",
        bookScoped: true,
      },
      {
        key: "beta-readers",
        label: "Beta readers",
        href: "/author/audience?surface=beta-readers",
        bookScoped: true,
      },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    href: "/author/analytics",
    icon: "analytics",
    bookScoped: true,
    children: [
      { key: "overview", label: "Overview", href: "/author/analytics", bookScoped: true },
      {
        key: "reading-behavior",
        label: "Reading behavior",
        href: "/author/analytics?section=reading-behavior",
        bookScoped: true,
      },
      {
        key: "revenue",
        label: "Revenue",
        href: "/author/analytics?section=revenue",
        bookScoped: true,
      },
    ],
  },
];

export const AUTHOR_SIDEBAR_FOOTER: AuthorSidebarLink[] = [
  { key: "profile", label: "Profile", href: "/author/profile", icon: "profile" },
  { key: "settings", label: "Settings", href: "/author/settings", icon: "settings" },
  { key: "switch-to-reader", label: "Switch to reader", href: "/reader/home", icon: "switch-to-reader" },
];

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
    links: AUTHOR_WORKFLOW_NAV.map((item) => ({
      label: item.label,
      href: item.href,
    })),
    actions: {
      primary: { label: "Library", href: "/author/library" },
      showSearch: false,
      searchPlaceholder: "Search books...",
      searchHref: "/author/home",
      showProfileMenu: true,
    },
  },
  APP_READER: {
    homeHref: "/reader/home",
    links: [
      { label: "Home", href: "/reader/home" },
      { label: "Discover", href: "/reader/discover" },
      { label: "Library", href: "/reader/library" },
    ],
    actions: {
      showSearch: true,
      searchPlaceholder: "Search books, authors...",
      searchHref: "/reader/discover",
      showProfileMenu: true,
    },
  },
};
