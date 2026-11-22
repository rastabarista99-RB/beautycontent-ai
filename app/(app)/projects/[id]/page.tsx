import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDeleteButton } from "@/components/projects/project-delete-button";
import { ProjectForm } from "@/components/projects/project-form";
import { createClient } from "@/lib/supabase/server";
import { parseSavedGeneratedContent } from "@/lib/validation/generated-content";
import { ProjectGeneration } from "@/components/projects/project-generation";

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!projectIdPattern.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (claimsError || !userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, type, goal, title, status, created_at, updated_at, content")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    return <p role="alert" className="text-sm text-error">We could not load this project. Please try again.</p>;
  }

  if (!project) {
    notFound();
  }

  const savedContent = parseSavedGeneratedContent(project.content);

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-primary hover:underline" href="/projects">
          Back to projects
        </Link>
        <p className="text-sm font-medium text-primary">Project</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
          {project.title || "Edit project"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Update the project details or generate content for this project.
        </p>
      </div>
      <ProjectForm
        project={{
          id: project.id,
          type: project.type,
          goal: project.goal,
          title: project.title,
        }}
      />
      <ProjectGeneration
        projectId={project.id}
        savedContent={savedContent}
        initialRevision={project.updated_at}
      />
      <ProjectDeleteButton projectId={project.id} />
    </div>
  );
}
