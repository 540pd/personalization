import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// The app's one typeface (#434), exposed as --font-inter for globals.css.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "GCOS Personalization",
  description: "Generation-first canvas for creative personalization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
