import { Plus, Puzzle } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { RepositoryCard } from "@/components/repository-card";
import { Button } from "@/components/ui/button";
import { repositories } from "@/lib/mock-data";

export default function RepositoriesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Configuration"
        title="Repositories"
        description="Terraform codebases prepared for semantic diagnosis and isolated candidate verification."
        action={<Button disabled title="GitHub App installation will be implemented in Phase 2"><Plus aria-hidden="true" />Add Repository</Button>}
      />

      <div className="flex items-start gap-3 rounded-lg border bg-secondary/35 px-4 py-3">
        <Puzzle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Repository installation is preview-only.</span> GitHub App installation and permission selection arrive in Phase 2.</p>
      </div>

      <section aria-labelledby="configured-repositories">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="configured-repositories" className="text-sm font-semibold">Configured repositories</h2>
          <span className="text-xs text-muted-foreground">{repositories.length} total · {repositories.filter((repository) => repository.enabled).length} enabled</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {repositories.map((repository) => <RepositoryCard key={repository.id} repository={repository} detailed />)}
        </div>
      </section>
    </div>
  );
}
