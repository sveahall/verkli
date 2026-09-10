import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./AuthShell.module.css";

export type AuthCardProps = {
  title: string;
  subtitle?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function AuthCard({ title, subtitle, description, children, footer, className }: AuthCardProps) {
  return (
    <div className={cn(styles.card, className)}>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.content}>{children}</div>
      {footer && <div className={styles.cardFooter}>{footer}</div>}
    </div>
  );
}
