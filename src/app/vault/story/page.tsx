import ProjectListPage from "../projects/project-list";

export default function StoryStudioPage() {
  return (
    <ProjectListPage
      heading="Story Studio"
      intro="Story and hybrid projects: Story Bible, characters and relationships, season → episode → scene → shot structure, timeline, continuity and references. Character portraits, shot frames and the Gallery use images from your Google Drive; removing an image from a project never deletes it from Drive."
      types={["story", "hybrid"]}
      defaultType="story"
      empty="No story projects yet."
      retryHref="/vault/story"
    />
  );
}
