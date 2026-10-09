import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono-stack", display: "swap" });

export const metadata: Metadata = {
  title: "DirectoryLaunch — publish your SaaS to curated directories and launch channels",
  description:
    "Review your product details once, publish to curated directories and launch channels, and track each submission from receipt to verified live listing.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#edede9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="surface-page fg-body min-h-dvh antialiased">
        <a
          href="#main"
          className="t-micro sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <SiteNav />
        <div id="main">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
