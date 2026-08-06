import { cn } from "@/lib/utils";
import styles from "./site-credit-footer.module.css";

type SiteCreditFooterProps = {
  /**
   * `light` — muted ink on light backgrounds (admin, claim).
   * `dark` — specified light-on-dark tokens (login, gradient pages).
   */
  tone?: "light" | "dark";
  className?: string;
};

function IndiaFlagIcon() {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      className={styles.flag}
      aria-hidden="true"
      focusable="false"
    >
      <title>India</title>
      <rect width="14" height="3.34" y="0" fill="#FF9933" />
      <rect width="14" height="3.32" y="3.34" fill="#FFFFFF" />
      <rect width="14" height="3.34" y="6.66" fill="#138808" />
      <circle cx="7" cy="5" r="1.15" fill="#000080" />
    </svg>
  );
}

/**
 * Subtle site credit line. Lives in normal document flow (never fixed/sticky)
 * so it sits below page content and stays readable when zoomed.
 */
export default function SiteCreditFooter({
  tone = "light",
  className,
}: SiteCreditFooterProps) {
  return (
    <footer
      className={cn(
        styles.footer,
        tone === "dark" ? styles.dark : styles.light,
        className
      )}
      role="contentinfo"
    >
      <p className={styles.row}>
        <span className={styles.item}>
          Crafted by{" "}
          <a
            href="https://linktr.ee/krushnasinh"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Krushnasinh Jadeja on Linktree"
            className={styles.link}
          >
            Krushnasinh Jadeja
          </a>
        </span>

        <span className={styles.sep} aria-hidden="true">
          ·
        </span>

        <span className={cn(styles.item, styles.india)}>
          <IndiaFlagIcon />
          India
        </span>

        <span className={styles.sep} aria-hidden="true">
          ·
        </span>

        <span className={styles.item}>
          Built with{" "}
          <a
            href="https://cursor.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Cursor website"
            className={styles.link}
          >
            Cursor
          </a>
        </span>
      </p>
    </footer>
  );
}
