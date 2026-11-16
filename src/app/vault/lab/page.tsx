import ProjectListPage from "../projects/project-list";

export default function EngineeringLabPage() {
  return (
    <ProjectListPage
      heading="Engineering Lab"
      intro="Engineering and hybrid projects: goals, task board, milestones, lab notebook (notes, experiments, test evidence, results, lessons), components and code links."
      types={["engineering", "hybrid"]}
      defaultType="engineering"
      empty="No engineering projects yet."
      retryHref="/vault/lab"
    />
  );
}
