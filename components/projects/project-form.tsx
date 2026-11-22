"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createProject, updateProject, type ProjectActionState } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: ProjectActionState = {};

type ProjectValues = {
  id: string;
  type: string;
  goal: string;
  title: string | null;
};

export function ProjectForm({ project }: { project?: ProjectValues }) {
  const action = project ? updateProject : createProject;
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      if (project) {
        router.refresh();
      } else {
        formRef.current?.reset();
        router.refresh();
      }
    }
  }, [project, router, state]);

  return (
    <Card>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-ink">{project ? "Edit project" : "Create a project"}</h2>
        <p className="mt-2 text-sm text-muted">
          {project ? "Update this project's basic details." : "Start by describing the goal for this project."}
        </p>
      </div>
      <form ref={formRef} action={formAction} className="space-y-4">
        {project && <input type="hidden" name="projectId" value={project.id} />}
        <label className="block text-sm font-medium text-ink">
          Project type
          <select
            className="mt-1.5 min-h-11 w-full rounded-control border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            name="type"
            defaultValue={project?.type ?? ""}
            required
          >
            {!project && <option value="" disabled>Select a project type</option>}
            <option value="post">Post</option>
            <option value="story">Story</option>
            <option value="reels">Reels</option>
            <option value="ad">Ad</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Goal
          <Textarea
            className="mt-1.5 min-h-24"
            name="goal"
            defaultValue={project?.goal ?? ""}
            maxLength={500}
            required
            aria-describedby="project-goal-hint"
          />
          <span id="project-goal-hint" className="mt-1 block text-xs font-normal text-muted">
            Up to 500 characters.
          </span>
        </label>
        <label className="block text-sm font-medium text-ink">
          Title <span className="font-normal text-muted">(optional)</span>
          <Input className="mt-1.5" name="title" defaultValue={project?.title ?? ""} maxLength={120} />
          <span className="mt-1 block text-xs font-normal text-muted">Up to 120 characters.</span>
        </label>
        {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
        {state.success && (
          <p role="status" className="text-sm text-success">
            {project ? "Project updated." : "Project created."}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? (project ? "Saving..." : "Creating...") : (project ? "Save changes" : "Create project")}
        </Button>
      </form>
    </Card>
  );
}
