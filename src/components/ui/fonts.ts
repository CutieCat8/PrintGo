import { Kanit } from "next/font/google";

/**
 * Display face for headings, prices and big numbers: Kanit (bold, italic available) gives the
 * "fast" feel. Body text stays Noto Sans Thai from the root layout.
 * Apply `displayFont.variable` on a wrapper; use the `font-display` class.
 */
export const displayFont = Kanit({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-kanit",
});
