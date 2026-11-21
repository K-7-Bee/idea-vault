import type { Metadata, Viewport } from "next";
import HomeView from "./portfolio/home-view";
import { SEED } from "@/lib/profile";
import { getPublishedProfile, publicFileUrl } from "@/lib/profile-public";

// Match the phone's browser bar to the sky at the top of the hero.
export const viewport: Viewport = { themeColor: "#1b4fb8" };

export const metadata: Metadata = {
  title: { absolute: "MD Kaushik Kamal — Portfolio" },
  description:
    "MD Kaushik Kamal, engineering science student at Jeonbuk National University with a diploma in electrical technology. Selected engineering and web projects, education and experience.",
};

// Phase 4B: the homepage text comes from the profile published in the Vault's Portfolio Manager.
// Until the first publish it is the seed, which is the text this page had before 4B. The page stays
// static; publishing refreshes it (see src/lib/profile-public.ts).
export default async function Home() {
  const published = await getPublishedProfile();
  const content = published?.content ?? SEED;
  // Phase 4C: the résumé goes through the stable /resume address; the photo is its public copy.
  const media = {
    resumeHref: content.resume.file.endsWith(".pdf") ? "/resume" : undefined,
    photoSrc: publicFileUrl(content.photo.file) ?? undefined,
  };
  return <HomeView content={content} publishedAt={published?.published_at} media={media} />;
}
