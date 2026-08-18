import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cloud, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getRepositoryForUser } from "@/lib/data/repositories";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RepositoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const repository = await getRepositoryForUser(user.id, id);
  if (!repository) notFound();
  const config = repository.config;

  return (
    <div className="space-y-7">
      <div>
        <Link href="/repositories" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Repositories</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">Granted through {repository.installation.accountLogin}</p>
              <Badge variant="outline">{repository.private ? "Private" : "Public"}</Badge>
            </div>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em]">{repository.fullName}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">GitHub metadata is synchronized. Agent settings are a non-persisting preview until configuration onboarding is implemented.</p>
          </div>
          <Button disabled>Save changes</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsCard title="General" description="Repository identity from the verified GitHub App installation.">
          <Field label="Repository" htmlFor="repository"><Input id="repository" value={repository.fullName} readOnly /></Field>
          <Field label="Default branch" htmlFor="default-branch"><Input id="default-branch" value={repository.defaultBranch} readOnly /></Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
            <div><Label>Agent enabled</Label><p className="mt-1 text-xs text-muted-foreground">Configuration persistence comes in a later phase.</p></div>
            <Switch label="Agent enabled" defaultChecked={config?.enabled ?? false} disabled />
          </div>
        </SettingsCard>

        <SettingsCard title="Terraform configuration" description="Preview the eventual repository-specific workspace settings.">
          <Field label="Terraform directory" htmlFor="terraform-dir" hint="Relative to the repository root."><Input id="terraform-dir" defaultValue={config?.terraformDir ?? "."} className="font-mono" /></Field>
          <Field label="Terraform version" htmlFor="terraform-version"><Select id="terraform-version" defaultValue={config?.terraformVersion ?? "1.9.8"}><option>1.9.8</option><option>1.8.5</option><option>1.7.5</option></Select></Field>
        </SettingsCard>

        <SettingsCard title="Agent configuration" description="Diagnosis context and bounded repair policy.">
          <Field label="Model" htmlFor="model"><Select id="model" defaultValue={config?.model ?? "gemini-2.5-pro"}><option value="gemini-2.5-pro">gemini-2.5-pro</option><option value="gemini-2.5-flash">gemini-2.5-flash</option></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Context mode" htmlFor="context-mode"><Select id="context-mode" defaultValue={(config?.contextMode ?? "SMART").toLowerCase()}><option value="minimal">Minimal</option><option value="smart">Smart</option><option value="full">Full</option></Select></Field>
            <Field label="Max repair attempts" htmlFor="max-attempts" hint="Engine maximum remains bounded to one."><Input id="max-attempts" type="number" min={0} max={1} defaultValue={config?.maxRepairAttempts ?? 1} /></Field>
          </div>
          {!config ? <p className="text-xs text-neutral-status">Agent configuration status: Not configured</p> : null}
        </SettingsCard>

        <SettingsCard title="AWS connection" description="Temporary verification access without permanent AWS keys.">
          <div className="flex items-center gap-3 rounded-lg border bg-secondary/30 p-3.5">
            <span className="flex size-8 items-center justify-center rounded-md border bg-neutral-status-muted text-neutral-status"><Cloud aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0"><p className="text-xs font-medium">Not connected</p><p className="mt-0.5 text-xs text-muted-foreground">AWS onboarding is not part of Phase 2.</p></div>
          </div>
          <Field label="Role ARN" htmlFor="role-arn"><Input id="role-arn" value="arn:aws:iam::ACCOUNT_ID:role/stfa-verification" readOnly className="font-mono text-xs" /></Field>
          <div className="flex flex-wrap items-center gap-3"><Button disabled><LockKeyhole aria-hidden="true" />Connect AWS</Button><span className="text-xs text-muted-foreground">Available in a later phase.</span></div>
        </SettingsCard>
      </div>

      <section aria-labelledby="repository-runs-heading">
        <div className="mb-3"><h2 id="repository-runs-heading" className="text-base font-semibold">Recent runs</h2><p className="mt-1 text-xs text-muted-foreground">No automatic run ingestion exists in this phase.</p></div>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{repository.agentRuns.length ? `${repository.agentRuns.length} persisted runs` : "No runs recorded for this repository."}</CardContent></Card>
      </section>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><CardHeader className="border-b"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-4 pt-5">{children}</CardContent></Card>;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}{hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}</div>;
}
