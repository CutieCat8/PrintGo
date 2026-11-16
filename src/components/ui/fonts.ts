import { Noto_Serif_Thai } from "next/font/google";

/**
 * Display face for headings, prices and big numbers: Noto Serif Thai gives the calm, printed
 * look of the wireframes. Body text is IBM Plex Sans Thai from the root layout.
 * Apply `displayFont.variable` on a wrapper; use the `font-display` class.
 */
export const displayFont = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-serif-thai",
});
