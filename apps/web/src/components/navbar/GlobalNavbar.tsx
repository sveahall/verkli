"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import UserMenu from "@/components/navbar/UserMenu";
import NotificationBell from "@/components/notifications/NotificationBell";
import { createClient } from "@/lib/supabase/client";
import { getActiveRoleFromCookies } from "@/lib/active-role";
import type { NavActions, NavLink } from "@/nav/navConfig";
import type { User } from "@supabase/supabase-js";

const VERKLI_ROLE_KEY = "verkli_role";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

const dropdownGlassProps = {
  displace: 0.6,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 52,
  opacity: 0.96,
  backgroundOpacity: 0.22,
  blur: 18,
  saturation: 1.3,
  mixBlendMode: "screen",
};

const dropdownHeaderMeta: Record<
  string,
  { title: string; description?: string }
> = {
  Discover: {
    title: "Discover",
    description: "Find new stories by theme, genre, and author.",
  },
  Library: {
    title: "Library",
    description: "Everything you have started, bookmarked, or finished.",
  },
  "My World": {
    title: "My World",
    description: "Your author home: stats, profile, and overview.",
  },
  Books: {
    title: "Books",
    description: "Manage drafts, published books, and shelves.",
  },
  Product: {
    title: "Product",
    description: "Explore the Verkli platform and core capabilities.",
  },
  App: {
    title: "App",
    description: "Get the reader app and learn how it works.",
  },
};

const dropdownItemMeta: Record<
  string,
  Record<string, { description?: string; icon: ReactNode }>
> = {
  Discover: {
    Discover: {
      description: "Start with curated picks and language filters.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l3 6 6.5 1-4.8 4.6 1.2 6.4-5.9-3.2-5.9 3.2 1.2-6.4L2.5 10.5 9 9.5 12 3.5z" />
        </svg>
      ),
    },
    Genres: {
      description: "Browse curated collections and themes.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.5h15M4.5 12h10M4.5 17.5h6" />
        </svg>
      ),
    },
    Authors: {
      description: "Explore public author profiles.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      ),
    },
  },
  Library: {
    "Currently reading": {
      description: "Books you are actively reading.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5.5h11a3 3 0 013 3v10H8a3 3 0 00-3 3v-16z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 18.5h11" />
        </svg>
      ),
    },
    Bookmarks: {
      description: "Bookmarked for later and quick access.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4.75h10a2 2 0 0 1 2 2V19l-7-3-7 3V6.75a2 2 0 0 1 2-2Z" />
        </svg>
      ),
    },
    Finished: {
      description: "Completed stories and re-reads.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 12.5l3.5 3.5 7-7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.5h15v13h-15z" />
        </svg>
      ),
    },
  },
  "My World": {
    Overview: {
      description: "Author overview and quick actions.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h6.5M4.5 6.5h15M4.5 17.5h10" />
        </svg>
      ),
    },
    Stats: {
      description: "Performance and growth metrics.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 18.5h14M7 16V10M12 16V7M17 16v-4" />
        </svg>
      ),
    },
    "Profile preview": {
      description: "See how readers view your profile.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      ),
    },
  },
  Books: {
    "All books": {
      description: "Full overview of drafts and published books.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5.5h11a3 3 0 013 3v10H8a3 3 0 00-3 3v-16z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 18.5h11" />
        </svg>
      ),
    },
    Shelves: {
      description: "Collections and shelves you manage.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" />
        </svg>
      ),
    },
    Drafts: {
      description: "Works in progress and in review.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5h8M8 10.5h6M8 14.5h4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
        </svg>
      ),
    },
    Published: {
      description: "Live books and public releases.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 12.5l3.5 3.5 7-7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.5h15v13h-15z" />
        </svg>
      ),
    },
  },
  Product: {
    Product: {
      description: "Platform overview and key features.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15M4.5 12h15M4.5 16.5h10" />
        </svg>
      ),
    },
    "How it works": {
      description: "See the workflow from idea to published story.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5v5l3 1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1 0 7.5-7.5" />
        </svg>
      ),
    },
    "Case studies": {
      description: "Real author stories and outcomes.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 6.5h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 10h5M9.5 13.5h3" />
        </svg>
      ),
    },
  },
  App: {
    "App overview": {
      description: "What the reader app includes.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7.5h6M9 11h6M9 14.5h4" />
        </svg>
      ),
    },
    "How it works": {
      description: "Step-by-step reader flow.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 7.5h11M6.5 12h11M6.5 16.5h7" />
        </svg>
      ),
    },
  },
};

// Dropdown content for each navigation item
const dropdownContent = {
  Features: {
    title: "Platform Features",
    description: "Everything you need to publish and grow your books",
    items: [
      {
        icon: "📚",
        title: "Book Management",
        description: "Organize chapters, shelves, and collections",
      },
      {
        icon: "✍️",
        title: "AI Writing Assistant",
        description: "Generate content, hooks, and scripts",
      },
      {
        icon: "📱",
        title: "Short-form Content",
        description: "Create clips for TikTok, Reels, and more",
      },
      {
        icon: "📊",
        title: "Analytics & Insights",
        description: "Track performance and audience engagement",
      },
      {
        icon: "🎨",
        title: "Visual Assets",
        description: "Design covers, cards, and story visuals",
      },
      {
        icon: "🚀",
        title: "Publishing Tools",
        description: "Export to multiple formats and platforms",
      },
    ],
  },
  Integrations: {
    title: "Integrations",
    description: "Connect your favorite tools and platforms",
    items: [
      {
        icon: "📖",
        title: "Amazon KDP",
        description: "Direct publishing to Amazon",
      },
      {
        icon: "📘",
        title: "Apple Books",
        description: "Publish to Apple's platform",
      },
      {
        icon: "📗",
        title: "Google Play Books",
        description: "Reach Android readers",
      },
      {
        icon: "📱",
        title: "Social Media",
        description: "Auto-post to Instagram, TikTok, Twitter",
      },
      {
        icon: "📧",
        title: "Email Marketing",
        description: "Connect with Mailchimp, ConvertKit",
      },
      {
        icon: "💼",
        title: "CRM Tools",
        description: "Sync with HubSpot, Salesforce",
      },
    ],
  },
  Examples: {
    title: "Success Stories",
    description: "See how authors are using Verkli",
    items: [
      {
        icon: "⭐",
        title: "Bestseller Case Study",
        description: "How Sarah reached #1 on Amazon",
      },
      {
        icon: "📈",
        title: "Growth Strategies",
        description: "Tactics that drive reader engagement",
      },
      {
        icon: "🎯",
        title: "Content Templates",
        description: "Ready-to-use templates for your books",
      },
      {
        icon: "💡",
        title: "AI Prompts Library",
        description: "Proven prompts for better content",
      },
      {
        icon: "🎬",
        title: "Video Tutorials",
        description: "Step-by-step guides and walkthroughs",
      },
      {
        icon: "📝",
        title: "Blog & Resources",
        description: "Tips, tricks, and industry insights",
      },
    ],
  },
  FAQ: {
    title: "Frequently Asked Questions",
    description: "Quick answers to common questions",
    items: [
      {
        icon: "❓",
        title: "Getting Started",
        description: "How to set up your account and first book",
      },
      {
        icon: "💰",
        title: "Pricing & Plans",
        description: "Choose the right plan for your needs",
      },
      {
        icon: "🔒",
        title: "Privacy & Security",
        description: "How we protect your content and data",
      },
      {
        icon: "📖",
        title: "Book Publishing",
        description: "Everything about publishing workflows",
      },
      {
        icon: "🤖",
        title: "AI Features",
        description: "Understanding our AI capabilities",
      },
      {
        icon: "💬",
        title: "Support & Contact",
        description: "Get help from our team",
      },
    ],
  },
};

/**
 * Global Navbar component
 * 
 * Placerad i components/navbar/ för att:
 * - Vara tillgänglig på alla sidor via layout
 * - Centralisera navbar logik och design
 * - Automatiskt visa rätt navigation baserat på route
 * - Hantera auth state globalt
 */
type GlobalNavbarProps = {
  navMode?: "author" | "reader" | "public";
  navLinks?: NavLink[];
  navActions?: NavActions;
  homeHref?: string;
};

export default function GlobalNavbar({
  navMode,
  navLinks,
  navActions,
  homeHref,
}: GlobalNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [currentRole, setCurrentRole] = useState<"author" | "reader">("author");
  // SECURITY: Track original signup role - readers can NEVER switch to author
  const [originalRole, setOriginalRole] = useState<"author" | "reader" | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const resolveRole = async (activeUser: User | null) => {
      if (!activeUser) {
        setCurrentRole("author");
        setOriginalRole(undefined);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, preferences")
        .eq("user_id", activeUser.id)
        .maybeSingle();

      // SECURITY: Original signup role MUST come from profiles.role (DB).
      // Never trust user_metadata.role — it is client-writable via auth.updateUser().
      const profileRole = profile?.role;
      if (profileRole === "author" || profileRole === "reader") {
        setOriginalRole(profileRole);
      } else {
        setOriginalRole(undefined);
      }

      // Resolve active display role: prefer DB preferences, then profiles.role.
      let nextRole: "author" | "reader" = "author";
      const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
      if (preferenceRole === "author" || preferenceRole === "reader") {
        nextRole = preferenceRole;
      } else if (profileRole === "author" || profileRole === "reader") {
        nextRole = profileRole;
      }

      setCurrentRole(nextRole);
    };

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await resolveRole(user);
      setLoading(false);
    };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Keep the last chosen experience across sign-outs so "/" can route
        // returning users directly to the correct sign-in flow.
        setUser(null);
        setCurrentRole("author");
        setOriginalRole(undefined);
      } else if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        void resolveRole(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Spara senast använd roll så att "/" kan omdirigera rätt (visa aldrig väljaren igen)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/author")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "author");
    } else if (pathname?.startsWith("/reader")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "reader");
    }
  }, [pathname]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<{ key: string; top: number; left: number } | null>(null);

  const [logoHref, setLogoHref] = useState<string>(
    () => homeHref ?? (isauthorRoute ? "/author/home" : isReaderRoute ? "/reader/home" : "/")
  );
  useEffect(() => {
    const role = getActiveRoleFromCookies();
    setLogoHref(
      role === "reader" ? "/reader/home" : role === "author" ? "/author/home" : homeHref ?? "/"
    );
  }, [homeHref]);
  // Timeout så att flytt från trigger till portal inte stänger menyn (browser: number)
  const dropdownCloseTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dropdownOpen]);
  // Close mobile menu on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close transient UI state when route changes
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };
  const resolvedMode =
    navMode ??
    (pathname?.startsWith("/author")
      ? "author"
      : pathname?.startsWith("/reader")
        ? "reader"
        : "public");
  const isauthorRoute = resolvedMode === "author";
  const isReaderRoute = resolvedMode === "reader";
  const isPublicPage = resolvedMode === "public";

  // För menyn: använd route när vi är i author/reader, annars använd roll från profilen
  const displayRoleForMenu: "author" | "reader" =
    isReaderRoute ? "reader" : isauthorRoute ? "author" : currentRole;

  // Keep auth screens clean; everything else uses the global navbar
  const isSelectorPage = pathname === "/";
  // Dölj navbar på selector-sidan (/) – ska bara synas på author, reader, signin, signup m.fl.
  const hideNavbar = isSelectorPage && !navMode;

  const defaultauthorNavItems: NavLink[] = [
    { label: "Features", href: "/author#features", hasDropdown: true },
    { label: "Integrations", href: "/author#integrations", hasDropdown: true },
    { label: "Examples", href: "/author#examples", hasDropdown: true },
    { label: "FAQ", href: "/author#faq", hasDropdown: true },
  ];

  const defaultReaderNavItems: NavLink[] = [
    { label: "Discover", href: "/reader/discover" },
    { label: "Categories", href: "/reader/discover" },
    { label: "Authors", href: "/reader/discover" },
    { label: "About", href: "/reader" },
  ];

  const defaultPublicNavItems: NavLink[] = [
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
  ];

  const authorNavItems = isauthorRoute ? navLinks ?? defaultauthorNavItems : defaultauthorNavItems;
  const readerNavItems = isReaderRoute ? navLinks ?? defaultReaderNavItems : defaultReaderNavItems;
  const publicNavItems = isPublicPage ? navLinks ?? defaultPublicNavItems : defaultPublicNavItems;

  const primaryAction = navActions?.primary;
  const secondaryAction = navActions?.secondary;
  const showSearch = navActions?.showSearch ?? isauthorRoute;
  const searchPlaceholder = navActions?.searchPlaceholder ?? "Search books, authors...";
  const searchHref = navActions?.searchHref ?? (isauthorRoute ? "/author" : "/reader");
  const showProfileMenu = navActions?.showProfileMenu ?? true;
  const isActiveReaderLink = (href: string) => {
    if (!pathname) return false;
    const matches = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

    if (href === "/reader/home") {
      return pathname === "/reader" || pathname === "/reader/home" || pathname === "/reader/feed";
    }
    if (href === "/reader/discover") {
      return (
        matches("/reader/discover") ||
        matches("/reader/books") ||
        matches("/reader/lists") ||
        matches("/reader/authors") ||
        matches("/reader/genres")
      );
    }
    if (href === "/reader/library") {
      return matches("/reader/library") || matches("/reader/bookmarks");
    }
    return matches(href);
  };

  if (loading || hideNavbar) {
    return null; // Don't show navbar while loading or on auth screens
  }

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchValue.trim();
    if (!query) return;

    // Attach query as ?q=... to author dashboard – page can consume detta
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("q", query);
    router.push(`${searchHref}?${params.toString()}`);
  };

  return (
    <>
      {/* fixed + isolate + z-[9999] så Safari alltid ritar navbar ovanpå innehåll (DOM-ordning + explicit stacking) */}
      <div className="fixed top-0 left-0 right-0 z-[9999] isolate w-full flex-shrink-0 bg-background">
        <header className="mx-auto w-full max-w-[100vw] overflow-x-hidden overflow-y-visible px-4 pb-2 pt-3 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
        <GlassSurface
          {...glassBaseProps}
          forceFallback
          width="100%"
          height="68px"
          borderRadius={999}
          className="nav-glass flex-1 min-w-0 border border-gray-100/[0.05] bg-white/90 px-4 py-3 dark:border-white/10 dark:bg-slate-950/95 sm:px-6 md:px-11 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
        >
          <nav className="flex w-full min-w-0 items-center justify-between gap-4 sm:gap-6">
            {/* Logo and navigation */}
            <div className="flex min-w-0 items-center gap-4 sm:gap-10">
              {/* Logo: min 44px touch target on mobile */}
              <Link
                href={logoHref}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 focus:ring-offset-background"
              >
                <Image
                  src="/logo-dark.svg"
                  alt="Verkli"
                  width={140}
                  height={32}
                  className="h-8 w-auto dark:hidden"
                  style={{ width: "auto", height: "32px" }}
                />
                <Image
                  src="/favicon.svg"
                  alt="Verkli"
                  width={140}
                  height={32}
                  className="hidden h-8 w-auto dark:block"
                  style={{ width: "auto", height: "32px" }}
                />
              </Link>

              {/* Navigation links based on route */}
              {isauthorRoute && (
                <div className="hidden items-center gap-5 text-[14px] font-medium text-slate-700/90 dark:text-white/80 lg:flex">
                  {authorNavItems.map((item) => (
                    <div
                      key={item.label}
                      className="group relative"
                      onMouseEnter={(e) => {
                        if (!item.hasDropdown) return;
                        if (dropdownCloseTimeoutRef.current) {
                          clearTimeout(dropdownCloseTimeoutRef.current);
                          dropdownCloseTimeoutRef.current = null;
                        }
                        const trigger = e.currentTarget.querySelector("a, button");
                        const rect = trigger?.getBoundingClientRect();
                        if (rect) setDropdownOpen({ key: item.label, top: rect.bottom + 14, left: rect.left - 10 });
                      }}
                      onMouseLeave={() => {
                        dropdownCloseTimeoutRef.current = window.setTimeout(() => setDropdownOpen(null), 200);
                      }}
                    >
                      {(item.hasDropdown ?? (item.children?.length ?? 0) > 0) ? (
                        <Link
                          href={item.href}
                          aria-haspopup="menu"
                          aria-expanded={dropdownOpen?.key === item.label}
                          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-3 py-2 transition-colors hover:text-slate-900 hover:text-[#7058DD] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 rounded-md"
                        >
                          <span>{item.label}</span>
                          <svg
                            className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:rotate-180"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        </Link>
                      ) : (
                        <Link
                          href={item.href}
                          className="flex min-h-[44px] min-w-[44px] items-center px-3 py-2 transition-colors hover:text-slate-900 hover:text-[#7058DD] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 rounded-md"
                        >
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isReaderRoute && (
                <div className="hidden items-center gap-2 text-[14px] font-medium text-slate-700 dark:text-white/80 lg:flex">
                  {readerNavItems.map((item) => {
                    const hasDropdown = item.hasDropdown ?? (item.children?.length ?? 0) > 0;
                    if (hasDropdown) {
                      return (
                        <div
                          key={item.label}
                          className="group relative"
                          onMouseEnter={(e) => {
                            if (dropdownCloseTimeoutRef.current) {
                              clearTimeout(dropdownCloseTimeoutRef.current);
                              dropdownCloseTimeoutRef.current = null;
                            }
                            const trigger = e.currentTarget.querySelector("a");
                            const rect = trigger?.getBoundingClientRect();
                            if (rect) setDropdownOpen({ key: item.label, top: rect.bottom + 14, left: rect.left - 10 });
                          }}
                          onMouseLeave={() => {
                            dropdownCloseTimeoutRef.current = window.setTimeout(() => setDropdownOpen(null), 200);
                          }}
                        >
                          <Link
                            href={item.href}
                            aria-haspopup="menu"
                            aria-expanded={dropdownOpen?.key === item.label}
                            className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <span>{item.label}</span>
                            <svg
                              className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:rotate-180"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 4.5L6 7.5L9 4.5" />
                            </svg>
                          </Link>
                        </div>
                      );
                    }
                    const active = Boolean(item.href) && isActiveReaderLink(item.href);
                    return (
                      <Link
                        key={item.label}
                        href={item.href || "#"}
                        aria-current={active ? "page" : undefined}
                        className={`rounded-full px-4 py-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12] ${
                          active
                            ? "bg-slate-900 text-white shadow-[0_6px_18px_rgba(15,23,42,0.18)] dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}

              {isPublicPage && (
                <div className="hidden items-center gap-6 text-[15px] font-medium text-slate-700 dark:text-white/80 lg:flex">
                  {publicNavItems.map((item) => (
                    <div
                      key={item.label}
                      className="group relative"
                      onMouseEnter={(e) => {
                        if (!item.hasDropdown) return;
                        if (dropdownCloseTimeoutRef.current) {
                          clearTimeout(dropdownCloseTimeoutRef.current);
                          dropdownCloseTimeoutRef.current = null;
                        }
                        const trigger = e.currentTarget.querySelector("a, button");
                        const rect = trigger?.getBoundingClientRect();
                        if (rect) setDropdownOpen({ key: item.label, top: rect.bottom + 8, left: rect.left });
                      }}
                      onMouseLeave={() => {
                        dropdownCloseTimeoutRef.current = window.setTimeout(() => setDropdownOpen(null), 200);
                      }}
                    >
                      {item.hasDropdown ? (
                        <Link
                          href={item.href}
                          aria-haspopup="menu"
                          aria-expanded={dropdownOpen?.key === item.label}
                          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 focus:ring-offset-transparent rounded-md"
                        >
                          <span>{item.label}</span>
                          <svg
                            className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:rotate-180"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        </Link>
                      ) : (
                        <Link
                          href={item.href}
                          className="flex min-h-[44px] min-w-[44px] items-center px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 rounded-md"
                        >
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Hamburger – endast mobil/tablet, plats för menyn */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200/80 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10 lg:hidden"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {(isauthorRoute || isReaderRoute) && user ? (
                <>
                  {/* Sök – expanderar på hover/focus och skickar query som ?q=... */}
                  {showSearch && (
                    <form
                      onSubmit={handleSearchSubmit}
                      className="group relative hidden h-9 items-center md:flex"
                    >
                      <div className="flex h-9 items-center gap-2 rounded-full border border-slate-200/80 pl-2 pr-0.5 text-slate-600 backdrop-blur-md transition-all duration-200 ease-out hover:border-slate-300 dark:hover:border-white/30 group-focus-within:border-slate-300 dark:group-focus-within:border-white/30 dark:border-white/25 dark:text-white/80 dark:hover:border-white/30 dark:group-focus-within:border-white/30">
                        <svg
                          className="h-4 w-4 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                          placeholder={searchPlaceholder}
                          className="w-0 bg-transparent text-[13px] font-medium text-slate-800 placeholder-slate-400 opacity-0 outline-none transition-all duration-200 ease-out group-hover:w-48 group-hover:opacity-100 group-focus-within:w-48 group-focus-within:opacity-100 dark:text-white dark:placeholder-white/40"
                        />
                      </div>
                    </form>
                  )}

                  {/* Upgrade / Share – stil enligt referens, funktion kan kopplas senare */}
                  {primaryAction && (
                    <button
                      type="button"
                      onClick={() => router.push(primaryAction.href)}
                      className="hidden h-9 items-center rounded-full border border-slate-200/80 px-5 text-[13px] font-medium text-slate-900 dark:text-white transition-all md:inline-flex dark:border-white/[0.15]"
                    >
                      {primaryAction.label}
                    </button>
                  )}

                  <NotificationBell />

                  {showProfileMenu && (
                    <UserMenu user={user} onSignOut={handleSignOut} currentRole={displayRoleForMenu} originalRole={originalRole} />
                  )}
                </>
              ) : (
                <>
                  {/* Sign in / Sign up – endast desktop; på mobil finns de i mobilmenyn och i hero */}
                  {!user && (
                    <div className="hidden items-center gap-3 lg:flex">
                      {isPublicPage && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                      {isauthorRoute && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/author/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/author/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                      {isReaderRoute && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/reader/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/reader/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                    </div>
                  )}

                  {/* Language selector */}
                  <div className="hidden items-center gap-3 md:flex">
                    {/* Language selector */}
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-700 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-white/80 dark:hover:text-white"
                      aria-label="Select language"
                    >
                      <svg
                        width="24"
                        height="10"
                        viewBox="0 0 48 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-slate-700 dark:text-white/80"
                      >
                        <path d="M11.5086 11.7646L7.74559 0.92622C7.71044 0.824993 7.56746 0.824502 7.53162 0.925485L3.63734 11.898" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                        <path d="M5.07666 8.38086H10.1082" stroke="currentColor" strokeWidth="1.70079"/>
                        <path d="M16.3799 9.16016L26.4783 9.16016" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                        <path d="M21.4292 6.52148L21.4292 9.15952" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                        <path d="M16.3799 18.4076C23.4665 15.5376 24.2815 11.1439 24.8838 9.23047" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                        <path d="M18.1519 12.4199C19.0849 14.0853 20.8448 16.601 24.8487 18.4435" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                        <path d="M42.1924 11.9722C42.3572 12.138 42.6283 12.138 42.793 11.9722L47.045 7.69522C47.2098 7.52949 47.2098 7.25683 47.045 7.0911C46.8802 6.92536 46.6092 6.92536 46.4444 7.0911L42.4927 11.066L38.5411 7.0911C38.3763 6.92536 38.1052 6.92536 37.9405 7.0911C37.7757 7.25683 37.7757 7.52949 37.9405 7.69522L42.1924 11.9722Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>

                  {/* User menu för inloggade användare (ej author route) */}
                  {user && showProfileMenu && (
                    <UserMenu user={user} onSignOut={handleSignOut} currentRole={displayRoleForMenu} originalRole={originalRole} />
                  )}
                </>
              )}
            </div>
          </nav>
        </GlassSurface>
      </div>

      {/* Mobilmeny – fullskärm med länkar + Sign in / Sign up */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[998] lg:hidden"
          aria-hidden="false"
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close menu"
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[min(100vw,22rem)] flex-col gap-6 overflow-y-auto border-l border-slate-200/80 bg-white/95 px-6 pb-8 pt-[calc(88px+0.5rem)] shadow-xl dark:border-white/10 dark:bg-slate-950/95">
            <div className="flex flex-col gap-1">
              {isPublicPage &&
                publicNavItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.href || `#${item.label.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-[44px] min-w-[44px] items-center rounded-xl px-4 py-3 text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/90 dark:hover:bg-white/10"
                  >
                    {item.label}
                  </a>
                ))}
              {isauthorRoute &&
                authorNavItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.href || `#${item.label.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-[44px] min-w-[44px] items-center rounded-xl px-4 py-3 text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/90 dark:hover:bg-white/10"
                  >
                    {item.label}
                  </a>
                ))}
              {isReaderRoute &&
                readerNavItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.href) {
                        router.push(item.href);
                        setMobileMenuOpen(false);
                      }
                    }}
                    className="flex min-h-[44px] min-w-[44px] items-center rounded-xl px-4 py-3 text-left text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/90 dark:hover:bg-white/10"
                  >
                    {item.label}
                  </button>
                ))}
            </div>
            {!user && (
              <div className="mt-auto flex flex-col gap-3 border-t border-slate-200/80 pt-6 dark:border-white/10">
                {isPublicPage && (
                  <>
                    <Link
                      href={secondaryAction?.href ?? "/signin"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-secondary w-full justify-center"
                    >
                      {secondaryAction?.label ?? "Sign in"}
                    </Link>
                    <Link
                      href={primaryAction?.href ?? "/signup"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-primary w-full justify-center"
                    >
                      {primaryAction?.label ?? "Sign up"}
                    </Link>
                  </>
                )}
                {isauthorRoute && (
                  <>
                    <Link
                      href={secondaryAction?.href ?? "/author/signin"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-secondary w-full justify-center"
                    >
                      {secondaryAction?.label ?? "Sign in"}
                    </Link>
                    <Link
                      href={primaryAction?.href ?? "/author/signup"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-primary w-full justify-center"
                    >
                      {primaryAction?.label ?? "Sign up"}
                    </Link>
                  </>
                )}
                {isReaderRoute && (
                  <>
                    <Link
                      href={secondaryAction?.href ?? "/reader/signin"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-secondary w-full justify-center"
                    >
                      {secondaryAction?.label ?? "Sign in"}
                    </Link>
                    <Link
                      href={primaryAction?.href ?? "/reader/signup"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-primary w-full justify-center"
                    >
                      {primaryAction?.label ?? "Sign up"}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
      </div>
      {/* Spacer i flödet så innehåll börjar under fixed navbar; scrollar bort medan navbaren ligger kvar högst upp */}
      <div className="h-[88px] flex-shrink-0 bg-background" aria-hidden />
      {/* Portal: dropdown utanför navbar DOM så ingen stacking/overflow klipper; z 100 ovanför allt */}
      {typeof document !== "undefined" &&
        dropdownOpen &&
        createPortal(
          (() => {
            const navItems = isauthorRoute ? authorNavItems : isReaderRoute ? readerNavItems : publicNavItems;
            const openItem = navItems.find((i) => i.label === dropdownOpen!.key);
            const childCount = openItem?.children?.length ?? 0;
            const columnCount = childCount > 4 ? 2 : 1;
            const width = childCount > 0 ? (columnCount === 1 ? 420 : 560) : 720;
            const left = typeof window !== "undefined"
              ? Math.max(12, Math.min(dropdownOpen!.left, window.innerWidth - width - 12))
              : dropdownOpen!.left;
            const containerClass = childCount > 0
              ? (columnCount === 1
                  ? "w-[min(420px,calc(100vw-2rem))]"
                  : "w-[min(560px,calc(100vw-2rem))]")
              : "w-[min(720px,calc(100vw-2.5rem))]";

            return (
              <div
                className="transition-all duration-300 ease-out"
                style={{
                  position: "fixed",
                  top: dropdownOpen!.top,
                  left,
                  zIndex: 10000,
                }}
                onMouseEnter={() => {
                  if (dropdownCloseTimeoutRef.current) {
                    clearTimeout(dropdownCloseTimeoutRef.current);
                    dropdownCloseTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => setDropdownOpen(null)}
              >
                <GlassSurface
                  {...dropdownGlassProps}
                  width="100%"
                  height="auto"
                  borderRadius={20}
                  className={`nav-mega ${containerClass} max-h-[min(calc(100dvh-120px),32rem)] overflow-y-auto overscroll-contain border-0 px-4 py-4 sm:px-5 sm:py-5`}
                >
                  {(() => {
                    if (openItem?.children?.length) {
                      const header = dropdownHeaderMeta[openItem.label];
                      const itemMeta = dropdownItemMeta[openItem.label] ?? {};
                      const resolvedChildren =
                        isReaderRoute && openItem.label === "Library"
                          ? [
                              { label: "Currently reading", href: "/reader/library?tab=reading" },
                              { label: "Bookmarks", href: "/reader/library?tab=saved" },
                              { label: "Finished", href: "/reader/library?tab=finished" },
                            ]
                          : openItem.children;
                      return (
                        <div className="space-y-4">
                          {header && (
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
                                {header.title}
                              </p>
                              {header.description && (
                                <p className="text-[13px] text-slate-600 dark:text-white/60">
                                  {header.description}
                                </p>
                              )}
                            </div>
                          )}
                          <div className={columnCount === 1 ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
                            {resolvedChildren.map((child, idx) => {
                              const meta = itemMeta[child.label];
                              return (
                                <Link
                                  key={idx}
                                  href={child.href}
                                  onClick={() => setDropdownOpen(null)}
                                  className="group/item flex items-start gap-3 rounded-2xl border border-transparent px-3 py-3 transition-all duration-150 hover:border-slate-200/80 hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12] dark:hover:border-white/10 dark:hover:bg-white/[0.08]"
                                >
                                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700 ring-1 ring-black/5 transition-colors group-hover/item:bg-slate-900/10 dark:bg-white/10 dark:text-white dark:ring-white/10">
                                    {meta?.icon ?? (
                                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-slate-900 transition-colors group-hover/item:text-[#907AFF] dark:text-white dark:group-hover/item:text-[#907AFF]">
                                      {child.label}
                                    </p>
                                    {meta?.description && (
                                      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/60">
                                        {meta.description}
                                      </p>
                                    )}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    const legacy = dropdownContent[dropdownOpen!.key as keyof typeof dropdownContent];
                    if (legacy) {
                      return (
                        <>
                          <div className="mb-4 border-b border-slate-200/80 pb-3 dark:border-white/10">
                            <h3 className="text-[17px] font-semibold leading-tight text-slate-900 dark:text-white">
                              {legacy.title}
                            </h3>
                            <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-white/60">
                              {legacy.description}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {legacy.items.map((menuItem, idx) => (
                              <div
                                key={idx}
                                className="group/item cursor-pointer rounded-2xl border border-transparent px-4 py-3 transition-all duration-150 hover:border-slate-200/80 hover:bg-slate-100/80 dark:hover:border-white/10 dark:hover:bg-white/[0.08]"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900/5 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                                    <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-[14px] font-semibold leading-tight text-slate-900 transition-colors group-hover/item:text-[#907AFF] dark:text-white dark:group-hover/item:text-[#907AFF]">
                                      {menuItem.title}
                                    </h4>
                                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600 dark:text-white/60">
                                      {menuItem.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </GlassSurface>
              </div>
            );
          })(),
          document.body
        )}
    </>
  );
}
