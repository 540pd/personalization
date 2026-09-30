import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
