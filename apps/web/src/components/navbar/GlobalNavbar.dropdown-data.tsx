import type { ReactNode } from "react";

// Glass-surface tuning for the top navbar shell.
export const glassBaseProps = {
  displace: 0.12,
  distortionScale: -30,
  redOffset: 0,
  greenOffset: 0,
  blueOffset: 0,
  brightness: 50,
  opacity: 0.97,
  backgroundOpacity: 0.42,
  blur: 28,
  saturation: 1.2,
  mixBlendMode: "screen",
};

// Glass-surface tuning for the floating dropdown panel.
export const dropdownGlassProps = {
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

// Per-dropdown header copy (title + subtitle).
export const dropdownHeaderMeta: Record<
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

// Per-item description + icon for the route-aware dropdowns
// (Discover / Library / My World / Books / Product / App).
export const dropdownItemMeta: Record<
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
      description: "Finished stories and re-reads.",
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

// Legacy "mega-menu" content for the marketing/public nav
// (Features / Integrations / Examples / FAQ).
export const dropdownContent = {
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
