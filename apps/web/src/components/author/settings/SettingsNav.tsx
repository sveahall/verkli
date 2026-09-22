"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, CreditCard, LockKeyhole, Sparkles, UserRound } from "lucide-react";

export const settingsSections = [
  { href: "/author/settings/account", label: "Account", icon: UserRound },
  { href: "/author/settings/security", label: "Security", icon: LockKeyhole },
  { href: "/author/settings/publishing", label: "Publishing defaults", icon: BookOpen },
  { href: "/author/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/author/settings/ai", label: "AI", icon: Sparkles },
  { href: "/author/settings/billing", label: "Billing & subscriptions", icon: CreditCard },
] as const;

/**
 * The settings index. These are real routes, so the browser back button,
 * a bookmark and a deep link all work — which in-page anchors never gave us.
 * `aria-current="page"` carries the active state for screen readers; the tint
 * is the visual half of the same fact.
 */
export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 @min-[880px]/settings:sticky @min-[880px]/settings:top-5 @min-[880px]/settings:flex-col @min-[880px]/settings:overflow-visible @min-[880px]/settings:rounded-none @min-[880px]/settings:border-0 @min-[880px]/settings:bg-transparent @min-[880px]/settings:p-0">
      {settingsSections.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon size={16} className="shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
