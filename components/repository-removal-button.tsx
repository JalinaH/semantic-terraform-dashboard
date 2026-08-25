"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { removeRepositoryFromDashboardAction } from "@/app/actions/github";
import { Button } from "@/components/ui/button";

export function RepositoryRemovalButton({ repositoryId, repositoryName, compact = false }: { repositoryId: string; repositoryName: string; compact?: boolean }) {
  return (
    <form action={removeRepositoryFromDashboardAction}>
      <input type="hidden" name="repositoryId" value={repositoryId} />
      <RemovalSubmit repositoryName={repositoryName} compact={compact} />
    </form>
  );
}

function RemovalSubmit({ repositoryName, compact }: { repositoryName: string; compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      className={compact ? "w-full text-destructive hover:text-destructive" : "text-destructive hover:text-destructive"}
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        const confirmed = window.confirm(`Remove ${repositoryName} from TerraFix?\n\nThis disables future diagnoses and hides it from the dashboard. Historical runs are preserved, and the GitHub grant is unchanged.`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <Trash2 aria-hidden="true" />
      {pending ? "Removing…" : compact ? "Remove" : "Remove from dashboard"}
    </Button>
  );
}
