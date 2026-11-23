import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDeleteButton } from "@/components/projects/project-delete-button";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectGeneration } from "@/components/projects/project-generation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseSavedGeneratedContent } from "@/lib/validation/generated-content";

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!projectIdPattern.test(id)) {
    notFound();
  }

  const session = await getSession();
  const userId = session?.userId ?? null;

  if (!userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id, userId },
      select: {
        id: true,
        type: true,
        goal: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        content: true,
      },
    });
  } catch {
    return <p role="alert" className="text-sm text-error">We could not load this project. Please try again.</p>;
  }

  if (!project) {
    notFound();
  }

  const savedContent = parseSavedGeneratedContent(project.content);
  const initialRevision = project.updatedAt instanceof Date
    ? project.updatedAt.toISOString()
    : String(project.updatedAt);

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
        initialRevision={initialRevision}
      />
      <ProjectDeleteButton projectId={project.id} />
    </div>
  );
}
