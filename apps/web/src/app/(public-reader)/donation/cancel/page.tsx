import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";

export const dynamic = "force-dynamic";

export default function DonationCancelPage() {
  return (
    <main className={styles.page}>
      <section className={styles.status}>
        <div className={styles.statusIcon}><ArrowLeft size={25} aria-hidden="true" /></div>
        <h1 className="text-foreground">Donation canceled</h1>
        <p className="text-base">
          No charge was made. You can try again whenever you want.
        </p>

        <div className={styles.actions}>
          <Link
            href="/reader/home"
            className={styles.primary}
          >
            Back to reader home
          </Link>
          <Link
            href="/reader/discover"
            className={styles.secondary}
          >
            Explore books
          </Link>
        </div>
      </section>
    </main>
  );
}
