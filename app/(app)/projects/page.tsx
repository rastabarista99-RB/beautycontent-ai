import Link from "next/link";

import { ProjectForm } from "@/components/projects/project-form";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

function getProjectTypeLabel(type: unknown): string {
  switch (type) {
    case "post":
      return "Post";
    case "story":
      return "Story";
    case "reels":
      return "Reels";
    case "ad":
      return "Ad";
    default:
      return "Project";
  }
}

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await getSession();
  const userId = session?.userId ?? null;

  if (!userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  let business: { id: string } | null;
  try {
    business = await prisma.business.findUnique({
      where: { userId },
      select: { id: true },
    });
  } catch {
    return <p role="alert" className="text-sm text-error">We could not check your business profile. Please try again.</p>;
  }

  if (!business) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Library</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Projects</h1>
          <p className="mt-2 max-w-2xl text-muted">Create projects to organize your content ideas.</p>
        </div>
        <Card>
          <h2 className="text-lg font-semibold text-ink">Set up your Business Profile first</h2>
          <p className="mt-2 text-sm text-muted">A Business Profile is required before you can create a project.</p>
          <Link className="mt-4 inline-flex text-sm font-medium text-primary hover:underline" href="/business">
            Go to Business Profile
          </Link>
        </Card>
      </div>
    );
  }

  let projects;
  try {
    projects = await prisma.project.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        goal: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    return <p role="alert" className="text-sm text-error">We could not load your projects. Please try again.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Library</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Projects</h1>
        <p className="mt-2 max-w-2xl text-muted">Create projects to organize your content ideas.</p>
      </div>

      <ProjectForm />

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <h2 className="font-semibold text-ink">No projects yet</h2>
          <p className="mt-2 text-sm text-muted">Create your first project to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const typeLabel = getProjectTypeLabel(project.type);
            const createdAtIso = project.createdAt instanceof Date
              ? project.createdAt.toISOString()
              : String(project.createdAt);
            return (
              <Card key={project.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink">
                      <Link className="hover:text-primary hover:underline" href={`/projects/${project.id}`}>
                        {project.title || `${typeLabel} project`}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted">{project.goal}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span>{typeLabel}</span>
                    <span className="capitalize">{project.status}</span>
                    <time dateTime={createdAtIso}>
                      Created {new Date(createdAtIso).toLocaleDateString()}
                    </time>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
