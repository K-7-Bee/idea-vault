import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Log in — Idea Vault" },
  description: "Owner login for the private Idea Vault.",
  robots: { index: false, follow: false },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
  openGraph: { title: "Idea Vault login", description: "Private workspace login.", type: "website" },
  twitter: { card: "summary", title: "Idea Vault login", description: "Private workspace login." },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
