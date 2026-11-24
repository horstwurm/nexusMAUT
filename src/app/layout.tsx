import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "nexusMAUT", template: "%s · nexusMAUT" },
  description: "Marketing-Automation: Kunden, Positionen, Kunden Selektionen, Journeys und Services.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
