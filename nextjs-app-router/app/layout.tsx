import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@sekyro/react/styles.css";
import "@sekyro/react/verification.css";
import "./globals.css";

export const metadata: Metadata = { title: "Sekyro AI Next.js sample" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
