import ProjectListPage from "../projects/project-list";

export default function StoryStudioPage() {
  return (
    <ProjectListPage
      heading="Story Studio"
      intro="Story and hybrid projects: Story Bible, characters and relationships, season → episode → scene → shot structure, timeline, continuity and references. Images arrive with the Google Drive integration."
      types={["story", "hybrid"]}
      defaultType="story"
      empty="No story projects yet."
      retryHref="/vault/story"
    />
  );
}
