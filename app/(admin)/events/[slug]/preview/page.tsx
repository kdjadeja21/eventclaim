import { notFound } from "next/navigation";

/**
 * Preview & Send is temporarily hidden site-wide.
 * Restore by re-exporting `./preview-page-content` and re-adding nav/quick-link entries.
 */
export default function PreviewPage() {
  notFound();
}
