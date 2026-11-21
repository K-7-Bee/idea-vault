import ProjectsFrame from "../projects/frame";

// Phase 4D: the Journal shares the public projects' header and footer.
export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return <ProjectsFrame journal>{children}</ProjectsFrame>;
}
