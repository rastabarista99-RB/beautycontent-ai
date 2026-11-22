import Link from "next/link";

import { ProjectForm } from "@/components/projects/project-form";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (claimsError || !userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (businessError) {
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

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, type, goal, title, status, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (projectsError) {
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
                    <time dateTime={project.created_at}>
                      Created {new Date(project.created_at).toLocaleDateString()}
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
