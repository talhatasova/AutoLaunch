import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/site/motion-provider";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import "./globals.css";

/**
 * Space Grotesk, standing in for ABC Monument Grotesk (licensed).
 *
 * The point of the swap is character. Archivo is a competent neo-grotesk with
 * no opinions: at display size it reads as "a headline", which is exactly the
 * anonymity that makes a page look generated. Space Grotesk carries actual
 * drawing - the single-storey `g`, the sheared `t`, the flattened `a` bowl -
 * so a 6rem headline reads as a specific typeface rather than as large text.
 *
 * Variable across 300-700, so the display/body contrast is weight and size
 * rather than the width axis the old stack leaned on.
 */
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-stack",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DirectoryLaunch — we submit your SaaS to the directories",
    template: "%s — DirectoryLaunch",
  },
  description:
    "Paste your app URL. We submit your listing to free SaaS and startup directories and show you the status of every one, live.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#edede9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      {/* `surface-page` and `fg-body` read the role tokens, so when a dark
          section takes the viewport and sets `data-theme` on the body, the
          overscroll gutter follows instead of flashing the light page. */}
      <body className="surface-page fg-body min-h-dvh antialiased">
        <a
          href="#main"
          className="t-micro sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SiteNav />
          <div id="main">{children}</div>
          <SiteFooter />
        </MotionProvider>
        <Toaster
          position="bottom-right"
          gap={8}
          toastOptions={{
            unstyled: true,
            classNames: {
              // Role utilities, not the fixed palette: a toast raised while a
              // dark section owns the viewport has to invert with it.
              toast:
                "w-[356px] border-2 edge-strong surface-raised fg-heading px-4 py-3 flex items-start gap-3 rounded-[2px]",
              title: "t-meta fg-heading",
              description: "text-[0.8125rem] leading-snug fg-muted mt-1",
              actionButton:
                "t-micro ml-auto shrink-0 self-center surface-accent px-2.5 h-7 inline-flex items-center cursor-pointer rounded-[2px]",
              error: "fg-danger",
            },
          }}
        />
      </body>
    </html>
  );
}
