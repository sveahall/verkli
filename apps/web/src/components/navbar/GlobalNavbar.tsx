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

const dropdownGlassProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.95,
  backgroundOpacity: 0.15,
  blur: 16,
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
  
  // Don't show navbar on role selection page or writer landing (has its own nav)
  const hideNavbar = pathname === '/' || (pathname?.startsWith('/writer') && !user);

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
    <header className="sticky top-4 z-[999] isolate mx-auto w-full max-w-[1660px] px-6 mb-2">
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
                        <div className="nav-dropdown pointer-events-none absolute left-1/2 top-full z-[998] w-[720px] max-w-[calc(100vw-3rem)] -translate-x-1/2 mt-4 px-3 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
                          <GlassSurface
                            {...dropdownGlassProps}
                            width="100%"
                            height="auto"
                            borderRadius={24}
                            className="nav-mega border border-white/40 dark:border-white/15 px-5 py-5 md:px-8 md:py-8 shadow-[0_26px_70px_-18px_rgba(15,23,42,0.65)] dark:shadow-[0_28px_80px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl bg-white/85 dark:bg-slate-950/90"
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
                                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                                  {dropdownContent[item as keyof typeof dropdownContent].items.map((menuItem, idx) => (
                                    <div
                                      key={idx}
                                      className="group/item cursor-pointer rounded-xl p-4 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.12] hover:shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/60 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10" />
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
                        <div className="nav-dropdown pointer-events-none absolute left-1/2 top-full z-[1000] w-[720px] max-w-[calc(100vw-3rem)] -translate-x-1/2 mt-4 px-3 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
                          <GlassSurface
                            {...dropdownGlassProps}
                            width="100%"
                            height="auto"
                            borderRadius={24}
                            className="nav-mega border border-white/40 dark:border-white/15 px-5 py-5 md:px-8 md:py-8 shadow-[0_26px_70px_-18px_rgba(15,23,42,0.65)] dark:shadow-[0_28px_80px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl bg-white/85 dark:bg-slate-950/90"
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
                                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                                  {dropdownContent[item.label as keyof typeof dropdownContent].items.map((menuItem, idx) => (
                                    <div
                                      key={idx}
                                      className="group/item cursor-pointer rounded-xl p-4 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/[0.12] hover:shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/60 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10" />
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
