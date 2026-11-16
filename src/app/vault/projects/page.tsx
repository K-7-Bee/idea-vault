import ProjectListPage from "./project-list";

export default function ProjectsPage() {
  return (
    <ProjectListPage
      heading="Project Library"
      intro="Every project, engineering and story alike. Projects are private; marking one Ready to showcase does not publish anything."
      types={["engineering", "story", "hybrid"]}
      defaultType="engineering"
      empty="No projects yet. Create one here, or open an idea and turn it into a project."
      retryHref="/vault/projects"
    />
  );
}
