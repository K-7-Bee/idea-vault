import type { Metadata, Viewport } from "next";
import SwRegister from "../sw-register";

export const metadata: Metadata = {
  title: { absolute: "Idea Vault — Private workspace" },
  description: "Private idea capture and organization.",
  applicationName: "Idea Vault",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Vault", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
  openGraph: { title: "Idea Vault", description: "Private idea workspace.", type: "website" },
  twitter: { card: "summary", title: "Idea Vault", description: "Private idea workspace." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5e6" },
    { media: "(prefers-color-scheme: dark)", color: "#061527" },
  ],
};

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <><SwRegister />{children}</>;
}
