export type Project = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  technologies: string[];
  overview: string;
  flow: { title: string; description: string }[];
  sections: { title: string; paragraphs: string[] }[];
  externalLink?: { label: string; href: string };
};

// Only published portfolio details and behavior visible in this repository belong here.
export const projects: Project[] = [
  {
    slug: "waste-to-energy-lighting",
    title: "Waste-to-Energy Lighting",
    category: "Electrical engineering",
    summary: "Renewable energy generated from waste, paired with an automatic lighting system. First prize at the CCN Polytechnic Institute innovation fair.",
    technologies: ["Renewable energy", "Automatic lighting"],
    overview: "This project connects two engineering ideas: generating energy from waste and using it in an automatic lighting system. It was presented at the CCN Polytechnic Institute innovation fair in Bangladesh, where it won first prize.",
    flow: [
      { title: "Waste", description: "The source material for energy generation." },
      { title: "Energy generation", description: "The renewable-energy part of the project." },
      { title: "Automatic lighting", description: "The application for the generated energy." },
    ],
    sections: [
      { title: "The engineering idea", paragraphs: ["Explore how an energy source and an automatic control system can work together in a practical application. The lighting system gives the energy-generation concept a concrete purpose."] },
      { title: "What this overview shows", paragraphs: ["The diagram above describes the concept, rather than a circuit schematic. Component choices, conversion method, power output, and efficiency are not documented here, so it should not be used as a construction guide."] },
    ],
  },
  {
    slug: "cha-restaurant",
    title: "Cha Restaurant",
    category: "Web development",
    summary: "A website for a friend's tea restaurant, built and shipped for a real business.",
    technologies: ["Web", "Vercel"],
    overview: "A website built for a friend's tea restaurant. This project takes web development beyond a practice exercise and into a public website for a real business.",
    flow: [
      { title: "A real business", description: "A friend's tea restaurant." },
      { title: "A website", description: "A public destination for the restaurant." },
      { title: "Deployment", description: "Hosted on Vercel." },
    ],
    sections: [
      { title: "From practice to a public website", paragraphs: ["The existing portfolio records the site as built and shipped. The project link below opens the restaurant website so visitors can explore the result directly."] },
      { title: "Scope of this overview", paragraphs: ["This overview does not claim traffic, sales improvements, or customer results. Detailed implementation notes and a source repository are not currently published here."] },
    ],
    externalLink: { label: "Visit restaurant website", href: "https://cha-restaurant.vercel.app" },
  },
  {
    slug: "idea-vault",
    title: "Idea Vault",
    category: "Personal software",
    summary: "A private app for capturing ideas with tags, files, and voice notes, with a local outbox for saving through connection interruptions.",
    technologies: ["Next.js", "React", "Supabase", "Tailwind CSS", "IndexedDB", "PWA"],
    overview: "An idea often arrives before there is time to organize it. Idea Vault combines a quick capture form with tags and four stages—raw, exploring, building, and done—so a small note can become something to work on later.",
    flow: [
      { title: "Capture on the device", description: "Text, tags, and pending attachments go into an IndexedDB outbox first." },
      { title: "Sync when connected", description: "Fixed idea and file IDs let interrupted uploads retry without creating new copies." },
      { title: "Organize privately", description: "Supabase stores ideas and file records; a private bucket holds attachments." },
    ],
    sections: [
      { title: "Capture and retrieval", paragraphs: ["Ideas can contain text, photos, files, or a recorded voice note. Hashtags become searchable tags. Content search, status folders, and list or grid views help retrieve saved ideas.", "The composer remembers its text draft in the browser. New ideas enter a device outbox before the form clears, so a temporary loss of connection does not require keeping the tab open."] },
      { title: "How the application fits together", paragraphs: ["Next.js renders the initial vault contents on the server. React handles capture, filtering, recording, and the device queue. Supabase provides authentication, database records, and private file storage.", "A production service worker caches the vault page and application assets for later offline visits. New captures can queue offline; searching the server and changing existing saved ideas still require a connection."] },
      { title: "Retrying without losing intent", paragraphs: ["Every queued idea and attachment has a fixed ID. Sync retries use those IDs to recognize records already written. Attachment failures keep the idea queued for another attempt.", "Deletion requests also stay in the outbox until cleanup succeeds. Stored files are removed before the idea record, preserving the information needed if cleanup must retry."] },
      { title: "Privacy and boundaries", paragraphs: ["The vault route checks the configured owner email on the server. Database policies restrict rows to the authenticated user, and storage policies restrict access to that user's folder. Attachments use temporary signed download links.", "This is a private application. This public case study explains its design without exposing saved ideas, recordings, or personal files."] },
      { title: "Current limits and next steps", paragraphs: ["Attachments are limited to 25 MB each. Offline availability depends on the browser retaining device storage and a previously cached visit. The local outbox is specific to the device where an idea was captured.", "More work remains around edits from multiple devices, recovery after session expiry, and end-to-end testing of interrupted uploads. The design described here is not a claim that every failure mode has been validated."] },
    ],
  },
];

export function getProject(slug: string) {
  return projects.find((project) => project.slug === slug);
}
