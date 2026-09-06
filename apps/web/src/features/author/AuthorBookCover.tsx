import Image from "next/image";
import styles from "./AuthorLandingPage.module.css";

type AuthorBookCoverProps = {
  edition?: "original" | "spanish";
  className?: string;
  priority?: boolean;
};

export default function AuthorBookCover({ edition = "original", className = "", priority = false }: AuthorBookCoverProps) {
  const spanish = edition === "spanish";

  return (
    <div className={`${styles.bookCover} ${spanish ? styles.coverSpanish : styles.coverOriginal} ${className}`} lang={spanish ? "es" : "en"}>
      <div className={styles.coverJacket}>
        <div className={styles.coverPhotograph}>
          <Image src="/images/author/the-shape-of-light-art.png" alt="" fill sizes="(max-width: 600px) 45vw, 300px" priority={priority} />
        </div>
        <span className={styles.coverGenre}>{spanish ? "UNA NOVELA" : "A NOVEL"}</span>
        <strong className={styles.coverTitle}>
          <span>{spanish ? "La forma" : "The shape"}</span>
          <span>{spanish ? "de la luz" : "of light"}</span>
        </strong>
      </div>
    </div>
  );
}
