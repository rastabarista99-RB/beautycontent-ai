"use client";

import { useActionState, useState } from "react";

import { deleteProject, type ProjectActionState } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const initialState: ProjectActionState = {};

export function ProjectDeleteButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(deleteProject, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      {!confirming ? (
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete project
        </Button>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-sm text-ink">Delete this project? This action cannot be undone.</p>
          {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Deleting..." : "Delete project"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
