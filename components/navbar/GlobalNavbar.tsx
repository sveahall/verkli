"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/navbar/UserMenu";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

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

const megaMenuColumns = [
  {
    title: "Start",
    iconClass: "from-blue-500 to-indigo-500",
    items: [
      { title: "Create your account", body: "Set up your author profile" },
      {
        title: "Upload your book",
        body: "Import/create your chapters",
        highlight: true,
      },
      { title: "Set your goals", body: "Launch, grow, or repurpose content" },
      {
        title: "Publishing basics",
        body: "Formats, platforms, and workflows",
      },
      {
        title: "AI automation",
        body: "Generate short clips",
        badge: "Coming soon",
      },
    ],
  },
  {
    title: "Create",
    iconClass: "from-blue-600 to-cyan-500",
    items: [
      { title: "Manage chapters", body: "Edit, organize, and update content" },
      { title: "Extract story moments", body: "Quotes, hooks, scenes, themes" },
      {
        title: "Short-form content",
        body: "Generate clips for TikTok & Reels",
      },
      { title: "Visual assets", body: "Covers, cards, and story visuals" },
    ],
  },
  {
    title: "Automate",
    iconClass: "from-emerald-500 to-green-400",
    items: [
      {
        title: "AI hooks & scripts",
        body: "Scroll-stopping copy, ready to post",
      },
      { title: "Auto-repurposing", body: "One chapter → many formats" },
      { title: "Content cadence", body: "Stay visible without daily work" },
      { title: "Smart recommendations", body: "What to post next" },
      { title: "AI Phone answering", body: "Generative AI voice answering" },
    ],
  },
  {
    title: "Grow",
    iconClass: "from-slate-200 to-white",
    items: [
      { title: "Audience insights", body: "See what resonates with readers" },
      { title: "Content performance", body: "Views, saves, follows" },
      {
        title: "Pre-launch campaigns",
        body: "Build momentum before release",
      },
      { title: "Evergreen growth", body: "Keep older books visible" },
      { title: "Reservations", body: "Manage reservations with ease" },
    ],
  },
];

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (event === "SIGNED_IN" && session?.user) setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  // Determine current role from pathname
  const currentRole = pathname?.startsWith('/writer') ? 'writer' : pathname?.startsWith('/reader') ? 'reader' : 'writer';

  // Determine if we're on a public page
  const isPublicPage = !pathname?.startsWith('/writer') && !pathname?.startsWith('/reader');
  
  // Don't show navbar on role selection page
  const hideNavbar = pathname === '/';

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
    return null; // Don't show navbar while loading or on role selection page
  }

  return (
    <header className="sticky top-6 z-[999] isolate mx-auto w-full max-w-[1660px] px-6">
      <div className="flex items-center gap-3">
        <GlassSurface
          {...glassBaseProps}
          width="100%"
          height="75px"
          borderRadius={300}
          className="nav-glass flex-1 border border-black/10 dark:border-white/10 px-8 py-4 md:px-12 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
        >
          <nav className="flex w-full items-center justify-between gap-6">
            {/* Logo and navigation */}
            <div className="flex items-center gap-10">
              <Link href={user ? (currentRole === 'writer' ? '/writer' : '/reader') : '/'}>
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
              {pathname?.startsWith('/writer') && (
                <div className="hidden items-center gap-8 text-[16px] font-medium text-slate-700 dark:text-white/80 lg:flex">
                  <Link
                    href="/writer"
                    className="relative px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white"
                  >
                    Home
                  </Link>
                  {writerNavItems.map((item) => (
                    <div key={item} className="group relative">
                      <button className="flex items-center gap-1.5 px-3 py-2 transition-colors hover:text-slate-900 dark:hover:text-white">
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
                        <div className="nav-dropdown pointer-events-none absolute left-1/2 top-full z-[1000] w-[1000px] -translate-x-1/2 pt-4 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                          <GlassSurface
                            {...glassBaseProps}
                            width="100%"
                            height="auto"
                            borderRadius={32}
                            className="nav-mega border border-black/10 dark:border-white/10 px-12 py-10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.25)] dark:shadow-[0_32px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
                          >
                            <div className="grid gap-12 lg:grid-cols-4">
                              {megaMenuColumns.map((column) => (
                                <div key={column.title} className="space-y-6">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${column.iconClass} shadow-lg`}
                                      />
                                      <span className="text-[15px] font-semibold text-slate-900 dark:text-white">
                                        {column.title}
                                      </span>
                                    </div>
                                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/20" />
                                  </div>
                                  <div className="space-y-3">
                                    {column.items.map((menuItem, idx) => (
                                      <div
                                        key={idx}
                                        className={`group/item cursor-pointer rounded-2xl p-4 transition-all duration-200 ${
                                          menuItem.highlight
                                            ? "bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/15 border border-[#907AFF]/30 dark:border-[#907AFF]/40 shadow-sm"
                                            : "hover:bg-slate-50/80 dark:hover:bg-white/[0.08] hover:shadow-sm"
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <h4 className="text-[14px] font-semibold leading-tight text-slate-900 dark:text-white group-hover/item:text-[#907AFF] dark:group-hover/item:text-[#907AFF] transition-colors">
                                              {menuItem.title}
                                            </h4>
                                            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600 dark:text-white/60">
                                              {menuItem.body}
                                            </p>
                                          </div>
                                          {menuItem.badge && (
                                            <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                              {menuItem.badge}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </GlassSurface>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pathname?.startsWith('/reader') && (
                <div className="hidden items-center gap-8 text-[16px] font-medium text-white/80 lg:flex">
                  {readerNavItems.map((item) => (
                    <button
                      key={item}
                      className="flex items-center gap-1.5 px-3 py-2 transition-colors hover:text-white"
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
                        <div className="nav-dropdown pointer-events-none absolute left-1/2 top-full z-[1000] w-[1000px] -translate-x-1/2 pt-4 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                          <GlassSurface
                            {...glassBaseProps}
                            width="100%"
                            height="auto"
                            borderRadius={32}
                            className="nav-mega border border-black/10 dark:border-white/10 px-12 py-10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.25)] dark:shadow-[0_32px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
                          >
                            <div className="grid gap-12 lg:grid-cols-4">
                              {megaMenuColumns.map((column) => (
                                <div key={column.title} className="space-y-6">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${column.iconClass} shadow-lg`}
                                      />
                                      <span className="text-[15px] font-semibold text-slate-900 dark:text-white">
                                        {column.title}
                                      </span>
                                    </div>
                                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/20" />
                                  </div>
                                  <div className="space-y-3">
                                    {column.items.map((menuItem, idx) => (
                                      <div
                                        key={idx}
                                        className={`group/item cursor-pointer rounded-2xl p-4 transition-all duration-200 ${
                                          menuItem.highlight
                                            ? "bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/15 border border-[#907AFF]/30 dark:border-[#907AFF]/40 shadow-sm"
                                            : "hover:bg-slate-50/80 dark:hover:bg-white/[0.08] hover:shadow-sm"
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <h4 className="text-[14px] font-semibold leading-tight text-slate-900 dark:text-white group-hover/item:text-[#907AFF] dark:group-hover/item:text-[#907AFF] transition-colors">
                                              {menuItem.title}
                                            </h4>
                                            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600 dark:text-white/60">
                                              {menuItem.body}
                                            </p>
                                          </div>
                                          {menuItem.badge && (
                                            <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                              {menuItem.badge}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </GlassSurface>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              {/* Search bar - only on writer pages */}
              {pathname?.startsWith('/writer') && (
                <div className="hidden md:block">
                  <div className="flex h-11 w-[300px] items-center gap-3 rounded-full border border-black/10 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.05] px-4 shadow-sm transition-all hover:border-black/20 dark:hover:border-white/20 hover:shadow-md">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-white/40"
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
                      placeholder="Search books, authors..."
                      className="flex-1 bg-transparent text-[14px] font-medium text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-white/40 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Theme toggle */}
              <div className="hidden items-center gap-3 md:flex">
                <ThemeToggle glassProps={glassBaseProps} />
              </div>

              {/* Create button - only on writer dashboard */}
              {pathname === '/writer' && user && (
                <button
                  onClick={() => {
                    // Trigger create dropdown - this will be handled by the page component
                    const event = new CustomEvent('openCreateDropdown');
                    window.dispatchEvent(event);
                  }}
                  className="rounded-full bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-6 py-2.5 text-[15px] font-semibold text-white shadow-lg shadow-[#907AFF]/25 transition-all hover:from-[#8069EE] hover:to-[#7058DD] hover:shadow-xl hover:shadow-[#907AFF]/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Create
                </button>
              )}

              {/* User menu or auth buttons */}
              {user ? (
                <UserMenu user={user} onSignOut={handleSignOut} currentRole={currentRole} />
              ) : (
                <>
                  {isPublicPage && (
                    <>
                      <Link
                        href="/signin"
                        className="px-6 text-[17px] font-regular text-slate-900 dark:text-white transition hover:text-slate-600 dark:hover:text-white/70"
                      >
                        Sign in
                      </Link>
                      <Link href="/signup">
                        <GlassSurface
                          {...glassBaseProps}
                          width="auto"
                          height="48px"
                          borderRadius={300}
                          className="border border-black/10 dark:border-white/10 px-6 py-3 [&_.glass-surface__content]:p-0"
                        >
                          <span className="text-[17px] font-medium text-slate-900 dark:text-white">
                            Sign up
                          </span>
                        </GlassSurface>
                      </Link>
                    </>
                  )}
                  {pathname?.startsWith('/reader') && (
                    <>
                      <Link
                        href="/reader/signin"
                        className="px-6 text-[17px] font-regular text-white transition hover:text-white/70"
                      >
                        Sign in
                      </Link>
                      <Link href="/reader/signup">
                        <GlassSurface
                          {...glassBaseProps}
                          width="auto"
                          height="48px"
                          borderRadius={300}
                          className="border border-white/10 px-6 py-3 [&_.glass-surface__content]:p-0"
                        >
                          <span className="text-[17px] font-medium text-white">
                            Sign up
                          </span>
                        </GlassSurface>
                      </Link>
                    </>
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
