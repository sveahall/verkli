import Link from "next/link";
import { Heart } from "lucide-react";
import styles from "@/components/public/PublicPage.module.css";

export const dynamic = "force-dynamic";

export default function DonationSuccessPage() {
  return (
    <main className={styles.page}>
      <section className={styles.status}>
        <div className={styles.statusIcon}><Heart size={25} aria-hidden="true" /></div>
        <h1 className="text-foreground">Thank you for your donation</h1>
        <p className="text-base">
          Your payment is recorded. Credits and donation status are updated automatically via webhook.
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
