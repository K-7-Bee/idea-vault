import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#31363f",
};

export const metadata: Metadata = {
  title: { default: "MD Kaushik Kamal — Portfolio", template: "%s | MD Kaushik Kamal" },
  description: "Engineering projects, practical web tools, and interactive experiments by MD Kaushik Kamal.",
  applicationName: "Kaushik's Portfolio",
  icons: { icon: "/k-mark.png", apple: "/k-mark.png" },
  openGraph: {
    title: "MD Kaushik Kamal — Engineering Portfolio",
    description: "Engineering science, electrical foundations, and learning by building.",
    siteName: "MD Kaushik Kamal",
    type: "website",
  },
  twitter: { card: "summary", title: "MD Kaushik Kamal — Portfolio", description: "Engineering projects, practical web tools, and interactive experiments." },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
