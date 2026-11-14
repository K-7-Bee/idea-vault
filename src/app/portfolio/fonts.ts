import { Galada, Inter, Manrope } from "next/font/google";

const script = Galada({ variable: "--font-galada", subsets: ["latin"], weight: "400" });
const nav = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const body = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const portfolioFonts = `${script.variable} ${nav.variable} ${body.variable}`;
