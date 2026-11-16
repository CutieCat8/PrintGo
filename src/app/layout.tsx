import type { Metadata, Viewport } from "next";
import { displayFont } from "@/components/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintGo",
  description: "Your file goes in. Your print comes home.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={displayFont.variable}>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
