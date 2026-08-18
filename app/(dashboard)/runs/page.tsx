import { CalendarDays, Filter, Search } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { RunsTable } from "@/components/runs-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { repositories, runs } from "@/lib/mock-data";

export default function RunsPage() {
  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Evidence history" title="Agent runs" description="Diagnosis results, bounded patch attempts, and verification evidence across configured repositories." />

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Filter aria-hidden="true" className="size-3.5 text-muted-foreground" />Filters <span className="font-normal text-muted-foreground">Preview controls</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-end">
            <FilterField label="Repository" htmlFor="filter-repository"><Select id="filter-repository" defaultValue="all"><option value="all">All repositories</option>{repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.fullName}</option>)}</Select></FilterField>
            <FilterField label="Status" htmlFor="filter-status"><Select id="filter-status" defaultValue="all"><option value="all">All statuses</option><option value="verified_first_attempt">Verified first attempt</option><option value="verified_after_retry">Verified after retry</option><option value="verification_failed">Verification failed</option><option value="patch_rejected">Patch rejected</option><option value="verification_unavailable">Unavailable</option></Select></FilterField>
            <FilterField label="Resource" htmlFor="filter-resource"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-resource" placeholder="aws_…" className="pl-9 font-mono text-xs" /></div></FilterField>
            <FilterField label="Date" htmlFor="filter-date"><div className="relative"><CalendarDays aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-date" type="date" className="pl-9" /></div></FilterField>
            <Button variant="outline" disabled>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="all-runs-heading">
        <div className="mb-3 flex items-center justify-between"><h2 id="all-runs-heading" className="text-sm font-semibold">All runs</h2><span className="text-xs text-muted-foreground">{runs.length} mock records</span></div>
        <Card className="overflow-hidden"><RunsTable runs={runs} /></Card>
      </section>
    </div>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor} className="text-muted-foreground">{label}</Label>{children}</div>;
}
