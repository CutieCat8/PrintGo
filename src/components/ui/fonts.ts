import { Google_Sans } from "next/font/google";

/**
 * The one typeface of the app: Google Sans, the face of the Gemini chat, with Thai glyphs.
 * Used for body text, headings and prices (headings only differ by weight).
 * Apply `displayFont.variable` on a wrapper (the root layout does); use `font-sans` / `font-display`.
 */
export const displayFont = Google_Sans({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-google-sans",
});
