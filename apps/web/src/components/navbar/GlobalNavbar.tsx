"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/navbar/UserMenu";
import { createClient } from "@/lib/supabase/client";
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
export default function GlobalNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [currentRole, setCurrentRole] = useState<"writer" | "reader">("writer");

  useEffect(() => {
    const supabase = createClient();
    const resolveRole = async (activeUser: User | null) => {
      if (!activeUser) {
        setCurrentRole("writer");
        return;
      }

      let nextRole: "writer" | "reader" = "writer";
      const metadataRole = activeUser.user_metadata?.role;
      if (metadataRole === "writer" || metadataRole === "reader") {
        nextRole = metadataRole;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", activeUser.id)
        .maybeSingle();

      if (profile?.role === "writer" || profile?.role === "reader") {
        nextRole = profile.role;
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
        setUser(null);
        setCurrentRole("writer");
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
    if (pathname?.startsWith("/writer")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "writer");
    } else if (pathname?.startsWith("/reader")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "reader");
    }
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  const isWriterRoute = pathname?.startsWith("/writer");
  const isReaderRoute = pathname?.startsWith("/reader");
  const isPublicPage = !isWriterRoute && !isReaderRoute;
  const isAuthRoute = Boolean(
    pathname &&
      (pathname.startsWith("/signin") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/writer/signin") ||
        pathname.startsWith("/writer/signup") ||
        pathname.startsWith("/writer/forgot-password") ||
        pathname.startsWith("/reader/signin") ||
        pathname.startsWith("/reader/signup") ||
        pathname.startsWith("/reader/forgot-password"))
  );

  // För menyn: använd route när vi är i writer/reader, annars använd roll från profilen
  const displayRoleForMenu: "writer" | "reader" =
    isReaderRoute ? "reader" : isWriterRoute ? "writer" : currentRole;

  // Keep auth screens clean; everything else uses the global navbar
  const hideNavbar = isAuthRoute;

  // Writer navigation items
  const writerNavItems = ["Features", "Integrations", "Examples", "FAQ"];

  // Reader navigation items
  const readerNavItems = ["Discover", "Categories", "Authors", "About"];

  // Public navigation items
  const publicNavItems = [
    { label: "Features", hasDropdown: true },
    { label: "Integrations", hasDropdown: true },
    { label: "Examples", hasDropdown: true },
    { label: "FAQ", hasDropdown: true },
  ];

  if (loading || hideNavbar) {
    return null; // Don't show navbar while loading or on auth screens
  }

  const handleWriterSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchValue.trim();
    if (!query) return;

    // Attach query as ?q=... to writer dashboard – page can consume detta
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("q", query);
    router.push(`/writer?${params.toString()}`);
  };

  return (
    <header className="sticky top-0 z-[999] isolate mx-auto w-full bg-gradient-to-b from-background/95 via-background/90 to-transparent px-4 pb-2 pt-3 md:px-6">
      <div className="flex items-center gap-3">
        <GlassSurface
          {...glassBaseProps}
          width="100%"
          height="68px"
          borderRadius={999}
          className="nav-glass flex-1 border border-gray-100/5 bg-white/90 px-7 py-3.5 dark:border-white/10 dark:bg-slate-950/95 md:px-11 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
        >
          <nav className="flex w-full items-center justify-between gap-6">
            {/* Logo and navigation */}
            <div className="flex items-center gap-10">
              {/* Logo: inloggad på writer/reader → dashboard; annars startsida (väljaren visas bara när navbar är dold) */}
              <Link href={isWriterRoute ? "/writer" : isReaderRoute ? "/reader" : "/"}>
                <img
                  src="/logo-dark.svg"
                  alt="Verkli"
                  className="h-8 w-auto dark:hidden"
                />
                <img
                  src="/favicon.svg"
                  alt="Verkli"
                  className="hidden h-8 w-auto dark:block"
                />
              </Link>

              {/* Navigation links based on route */}
              {isWriterRoute && (
                <div className="hidden items-center gap-7 text-[14px] font-medium text-slate-700/90 dark:text-white/80 lg:flex">
                  {writerNavItems.map((item) => (
                    <div key={item} className="group relative">
                      <button className="flex items-center gap-1.5 px-2 py-2 transition-colors hover:text-slate-900 hover:text-[#7058DD] dark:hover:text-white">
                        <span className="relative">{item}</span>
                        <svg
                          className="h-3.5 w-3.5 transition-transform group-hover:rotate-180"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 4.5L6 7.5L9 4.5" />
                        </svg>
                      </button>
                      {(item === "Features" || item === "Integrations" || item === "Examples" || item === "FAQ") && (
                        <div className="nav-dropdown pointer-events-none absolute left-[-10px] top-full mt-3.5 z-[998] w-[720px] max-w-[calc(100vw-2.5rem)] px-3 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
                          <GlassSurface
                            {...dropdownGlassProps}
                            width="100%"
                            height="auto"
                            borderRadius={24}
                            className="nav-mega max-h-[calc(100vh-120px)] overflow-y-auto border border-white/40 px-5 py-5 dark:border-white/15 md:px-8 md:py-8"
                          >
                            {dropdownContent[item as keyof typeof dropdownContent] && (
                              <>
                                <div className="mb-6">
                                  <h3 className="text-[18px] font-bold text-slate-900 dark:text-white mb-1.5">
                                    {dropdownContent[item as keyof typeof dropdownContent].title}
                                  </h3>
                                  <p className="text-[13px] text-slate-600 dark:text-white/70">
                                    {dropdownContent[item as keyof typeof dropdownContent].description}
                                  </p>
                                </div>
                                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                  {dropdownContent[item as keyof typeof dropdownContent].items.map((menuItem, idx) => (
                                    <div
                                      key={idx}
                                      className="group/item cursor-pointer rounded-xl p-4 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.12] border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900/5 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                                          <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <h4 className="text-[14px] font-semibold leading-tight text-slate-900 dark:text-white group-hover/item:text-[#907AFF] dark:group-hover/item:text-[#907AFF] transition-colors mb-1">
                                            {menuItem.title}
                                          </h4>
                                          <p className="text-[12px] leading-relaxed text-slate-600 dark:text-white/70">
                                            {menuItem.description}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </GlassSurface>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isReaderRoute && (
                <div className="hidden items-center gap-8 text-[16px] font-medium text-slate-700 dark:text-white/80 lg:flex">
                  {readerNavItems.map((item) => (
                    <button
                      key={item}
                      className="flex items-center gap-1.5 px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white"
                    >
                      <span className="relative">{item}</span>
                      <svg
                        className="h-3.5 w-3.5 transition-transform"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 4.5L6 7.5L9 4.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {isPublicPage && (
                <div className="hidden items-center gap-8 text-[16px] font-medium text-slate-700 dark:text-white/80 lg:flex">
                  {publicNavItems.map((item) => (
                    <div key={item.label} className="group relative">
                      <button className="flex items-center gap-1.5 px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white">
                        <span className="relative">{item.label}</span>
                        {item.hasDropdown && (
                          <svg
                            className="h-3.5 w-3.5 transition-transform group-hover:rotate-180"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        )}
                      </button>
                      {item.hasDropdown && (
                        <div className="nav-dropdown pointer-events-none absolute left-0 top-full mt-2 z-[998] w-[720px] max-w-[calc(100vw-2.5rem)] px-3 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
                          <GlassSurface
                            {...dropdownGlassProps}
                            width="100%"
                            height="auto"
                            borderRadius={24}
                            className="nav-mega max-h-[calc(100vh-120px)] overflow-y-auto border border-white/40 px-5 py-5 dark:border-white/15 md:px-8 md:py-8"
                          >
                            {dropdownContent[item.label as keyof typeof dropdownContent] && (
                              <>
                                <div className="mb-6">
                                  <h3 className="text-[18px] font-bold text-slate-900 dark:text-white mb-1.5">
                                    {dropdownContent[item.label as keyof typeof dropdownContent].title}
                                  </h3>
                                  <p className="text-[13px] text-slate-600 dark:text-white/70">
                                    {dropdownContent[item.label as keyof typeof dropdownContent].description}
                                  </p>
                                </div>
                                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                  {dropdownContent[item.label as keyof typeof dropdownContent].items.map((menuItem, idx) => (
                                    <div
                                      key={idx}
                                      className="group/item cursor-pointer rounded-xl p-4 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.12] border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900/5 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                                          <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <h4 className="text-[14px] font-semibold leading-tight text-slate-900 dark:text-white group-hover/item:text-[#907AFF] dark:group-hover/item:text-[#907AFF] transition-colors mb-1">
                                            {menuItem.title}
                                          </h4>
                                          <p className="text-[12px] leading-relaxed text-slate-600 dark:text-white/70">
                                            {menuItem.description}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </GlassSurface>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {isWriterRoute && user ? (
                <>
                  {/* Sök – expanderar på hover/focus och skickar query som ?q=... */}
                  <form
                    onSubmit={handleWriterSearchSubmit}
                    className="group relative hidden h-9 items-center md:flex"
                  >
                    <div className="flex h-9 items-center gap-2 rounded-full border border-gray-100/5 pl-2 pr-0.5 text-slate-600 backdrop-blur-md transition-all duration-200 ease-out hover:border-gray-200/10 group-focus-within:border-gray-200/10 dark:border-white/25 dark:text-white/80 dark:hover:border-white/30 dark:group-focus-within:border-white/30">
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
                        placeholder="Search books, authors..."
                        className="w-0 bg-transparent text-[13px] font-medium text-slate-800 placeholder-slate-400 opacity-0 outline-none transition-all duration-200 ease-out group-hover:w-48 group-hover:opacity-100 group-focus-within:w-48 group-focus-within:opacity-100 dark:text-white dark:placeholder-white/40"
                      />
                    </div>
                  </form>

                  {/* Upgrade / Share – stil enligt referens, funktion kan kopplas senare */}
                  <button
                    type="button"
                    className="hidden h-9 items-center rounded-full border border-gray-100/5 px-5 text-[13px] font-medium text-slate-900 dark:text-white transition-all md:inline-flex dark:border-white/15"
                  >
                    Upgrade to <span className="font-semibold ml-1"> PRO</span>
                  </button>

                  <UserMenu user={user} onSignOut={handleSignOut} currentRole={displayRoleForMenu} />
                </>
              ) : (
                <>
                  {/* Sign in / Sign up knappar - till vänster om toggle och language */}
                  {!user && (
                    <>
                      {isPublicPage && (
                        <>
                          <Link
                            href="/signin"
                            className="flex h-9 items-center justify-center rounded-full border border-gray/10 dark:border-white/10 bg-transparent px-5 text-[15px] font-medium text-slate-900 dark:text-white transition-colors hover:text-slate-600 dark:hover:text-white/70"
                          >
                            Sign in
                          </Link>
                          <Link href="/signup">
                            <GlassSurface
                              {...glassBaseProps}
                              width="auto"
                              height="36px"
                              borderRadius={999}
                              className="glass-surface--transparent border border-black/10 dark:border-white/10 px-5 [&_.glass-surface__content]:p-0"
                            >
                              <span className="flex h-9 items-center justify-center text-[15px] font-medium text-slate-900 dark:text-white">
                                Sign up
                              </span>
                            </GlassSurface>
                          </Link>
                        </>
                      )}
                      {isWriterRoute && (
                        <>
                          <Link
                            href="/writer/signin"
                            className="flex h-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-transparent px-4 text-[15px] font-medium text-slate-900 dark:text-white transition-colors hover:text-slate-600 dark:hover:text-white/70"
                          >
                            Sign in
                          </Link>
                          <Link href="/writer/signup">
                            <GlassSurface
                              {...glassBaseProps}
                              width="auto"
                              height="36px"
                              borderRadius={999}
                              className="glass-surface--transparent border border-black/10 dark:border-white/10 px-5 [&_.glass-surface__content]:p-0"
                            >
                              <span className="flex h-9 items-center justify-center text-[15px] font-medium text-slate-900 dark:text-white">
                                Sign up
                              </span>
                            </GlassSurface>
                          </Link>
                        </>
                      )}
                      {isReaderRoute && (
                        <>
                          <Link
                            href="/reader/signin"
                            className="flex h-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-transparent px-4 text-[15px] font-medium text-slate-900 dark:text-white transition-colors hover:text-slate-600 dark:hover:text-white/70"
                          >
                            Sign in
                          </Link>
                          <Link href="/reader/signup">
                            <GlassSurface
                              {...glassBaseProps}
                              width="auto"
                              height="36px"
                              borderRadius={999}
                              className="glass-surface--transparent border border-black/10 dark:border-white/10 px-5 [&_.glass-surface__content]:p-0"
                            >
                              <span className="flex h-9 items-center justify-center text-[15px] font-medium text-slate-900 dark:text-white">
                                Sign up
                              </span>
                            </GlassSurface>
                          </Link>
                        </>
                      )}
                    </>
                  )}

                  {/* Theme toggle och Language selector */}
                  <div className="hidden items-center gap-3 md:flex">
                    {/* Language selector */}
                    <GlassSurface
                      {...glassBaseProps}
                      width="auto"
                      height="36px"
                      borderRadius={999}
                      className="glass-surface--transparent border border-black/10 dark:border-white/10"
                    >
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center text-slate-700 dark:text-white/80"
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
                    </GlassSurface>

                    <ThemeToggle
                      glassProps={{ ...glassBaseProps, height: 36 }}
                      glassClassName="glass-surface--transparent border border-black/10 dark:border-white/10"
                      className="h-9 w-9 text-slate-700 dark:text-white/80"
                    />
                  </div>

                  {/* User menu för inloggade användare (ej writer route) */}
                  {user && (
                    <UserMenu user={user} onSignOut={handleSignOut} currentRole={displayRoleForMenu} />
                  )}
                </>
              )}
            </div>
          </nav>
        </GlassSurface>
      </div>
    </header>
  );
}
