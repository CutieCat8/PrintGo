import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintGo",
  description: "Your file goes in. Your print comes home.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
