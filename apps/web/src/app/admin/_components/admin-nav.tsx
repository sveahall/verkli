"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  BookOpen,
  Rocket,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/author-applications", label: "Author Applications", icon: UserCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/books", label: "Books", icon: BookOpen },
  { href: "/admin/beta", label: "Beta", icon: Rocket },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/admin/queues", label: "Queues", icon: ListChecks },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] shrink-0 items-center gap-3 whitespace-nowrap rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "border-accent-foreground/15 bg-accent text-accent-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
