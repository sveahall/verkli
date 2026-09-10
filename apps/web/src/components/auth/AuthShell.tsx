import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import styles from "./AuthShell.module.css";

export type AuthShellProps = {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  audience?: "author" | "reader";
};

export default function AuthShell({
  children,
  backHref = "/",
  backLabel = "Back to Verkli",
  audience,
}: AuthShellProps) {
  const reader = audience ? audience === "reader" : backHref.startsWith("/reader");

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href={backHref} aria-label="Verkli home" className={styles.logo}>
          <Image src="/logo-dark.svg" alt="Verkli" width={122} height={28} className="h-7 w-auto dark:hidden" priority />
          <Image src="/favicon.svg" alt="Verkli" width={122} height={28} className="hidden h-7 w-auto dark:block" priority />
        </Link>
        <Link href={backHref} className={styles.back}><ArrowLeft size={15} />{backLabel}</Link>
      </header>
      <div className={styles.layout}>
        <aside className={styles.story}>
          <p>{reader ? "For the love of reading." : "A little space for a big idea."}</p>
          <h2>{reader ? <>Your next story.<br /><span>Closer than ever.</span></> : <>One story.<br /><span>Every possibility.</span></>}</h2>
          <p>{reader ? "Find your next read, follow the authors behind it, and make room for the stories that stay with you." : "Writing, translation, audiobooks and publishing. Connected in one creative workspace."}</p>
          <div className={styles.storyFoot}><span>{reader ? "Discover. Follow. Read." : "Your words. Your world."}</span><ArrowUpRight size={20} aria-hidden="true" /></div>
        </aside>
        <div className={styles.form}>{children}</div>
      </div>
      <footer className={styles.footer}><span>Verkli</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Help</Link></div></footer>
    </main>
  );
}
