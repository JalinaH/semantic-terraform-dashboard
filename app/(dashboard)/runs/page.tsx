import { CalendarDays, Filter, GitPullRequestArrow, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { listInstallationsForUser } from "@/lib/github/installations";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const user = await requireAuthenticatedUser();
  const installations = await listInstallationsForUser(user.id);
  const repositories = installations.flatMap(({ githubInstallation }) => githubInstallation.repositories);

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Evidence history" title="Agent runs" description="This view is ready for real diagnosis and verification records once the execution pipeline is introduced." />

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Filter aria-hidden="true" className="size-3.5 text-muted-foreground" />Filters <span className="font-normal text-muted-foreground">Available after run ingestion</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-end">
            <FilterField label="Repository" htmlFor="filter-repository"><Select id="filter-repository" defaultValue="all" disabled><option value="all">All repositories</option>{repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.fullName}</option>)}</Select></FilterField>
            <FilterField label="Status" htmlFor="filter-status"><Select id="filter-status" defaultValue="all" disabled><option value="all">All statuses</option><option value="verified_first_attempt">Verified first attempt</option><option value="verified_after_retry">Verified after retry</option><option value="verification_failed">Verification failed</option><option value="patch_rejected">Patch rejected</option><option value="verification_unavailable">Unavailable</option></Select></FilterField>
            <FilterField label="Resource" htmlFor="filter-resource"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-resource" placeholder="aws_…" className="pl-9 font-mono text-xs" disabled /></div></FilterField>
            <FilterField label="Date" htmlFor="filter-date"><div className="relative"><CalendarDays aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-date" type="date" className="pl-9" disabled /></div></FilterField>
            <Button variant="outline" disabled>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="all-runs-heading">
        <div className="mb-3 flex items-center justify-between"><h2 id="all-runs-heading" className="text-sm font-semibold">All runs</h2><span className="text-xs text-muted-foreground">0 persisted records</span></div>
        <EmptyState icon={GitPullRequestArrow} title="No agent runs yet" description="Webhook processing, Terraform execution, and result ingestion are intentionally deferred beyond GitHub onboarding." />
      </section>
    </div>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor} className="text-muted-foreground">{label}</Label>{children}</div>;
}
