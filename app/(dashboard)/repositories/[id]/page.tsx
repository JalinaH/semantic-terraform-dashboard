import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cloud, ExternalLink, LockKeyhole } from "lucide-react";
import { RunsTable } from "@/components/runs-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getRepository, getRunsForRepository, repositories } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return repositories.map((repository) => ({ id: repository.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const repository = getRepository(id);
  if (!repository) return { title: "Repository not found" };
  const description = `Preview configuration for ${repository.fullName}.`;
  return {
    title: repository.fullName,
    description,
    openGraph: { title: repository.fullName, description, images: [] },
    twitter: { title: repository.fullName, description, images: [] },
  };
}

export default async function RepositoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getRepository(id);
  if (!repository) notFound();
  const repositoryRuns = getRunsForRepository(repository.id);

  return (
    <div className="space-y-7">
      <div>
        <Link href="/repositories" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Repositories</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs text-muted-foreground">Repository configuration</p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em]">{repository.fullName}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Preview controls are editable in the browser but are not persisted in Phase 1.</p>
          </div>
          <Button disabled>Save changes</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsCard title="General" description="Repository identity and agent availability.">
          <Field label="Repository" htmlFor="repository"><Input id="repository" value={repository.fullName} readOnly /></Field>
          <Field label="Default branch" htmlFor="default-branch"><Input id="default-branch" defaultValue={repository.defaultBranch} /></Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
            <div><Label>Agent enabled</Label><p className="mt-1 text-xs text-muted-foreground">Analyze eligible Terraform CI failures.</p></div>
            <Switch label="Agent enabled" defaultChecked={repository.enabled} />
          </div>
        </SettingsCard>

        <SettingsCard title="Terraform configuration" description="Workspace location and runtime target.">
          <Field label="Terraform directory" htmlFor="terraform-dir" hint="Relative to the repository root."><Input id="terraform-dir" defaultValue={repository.terraformDir} className="font-mono" /></Field>
          <Field label="Terraform version" htmlFor="terraform-version"><Select id="terraform-version" defaultValue={repository.terraformVersion}><option>1.9.8</option><option>1.8.5</option><option>1.7.5</option></Select></Field>
        </SettingsCard>

        <SettingsCard title="Agent configuration" description="Diagnosis context and bounded repair policy.">
          <Field label="Model" htmlFor="model"><Select id="model" defaultValue={repository.model}><option value="gemini-2.5-pro">gemini-2.5-pro</option><option value="gemini-2.5-flash">gemini-2.5-flash</option></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Context mode" htmlFor="context-mode"><Select id="context-mode" defaultValue={repository.contextMode}><option value="minimal">Minimal</option><option value="smart">Smart</option><option value="full">Full</option></Select></Field>
            <Field label="Max repair attempts" htmlFor="max-attempts" hint="Engine maximum remains bounded to one."><Input id="max-attempts" type="number" min={0} max={1} defaultValue={repository.maxRepairAttempts} /></Field>
          </div>
        </SettingsCard>

        <SettingsCard title="AWS connection" description="Temporary verification access without permanent AWS keys.">
          <div className="flex items-center gap-3 rounded-lg border bg-secondary/30 p-3.5">
            <span className={cn("flex size-8 items-center justify-center rounded-md border", repository.awsStatus === "connected" ? "border-success/25 bg-success-muted text-success-foreground" : "bg-neutral-status-muted text-neutral-status")}><Cloud aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0"><p className="text-xs font-medium capitalize">{repository.awsStatus.replace("_", " ")}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{repository.awsRegion ?? "No region configured"}</p></div>
          </div>
          <Field label="Role ARN" htmlFor="role-arn"><Input id="role-arn" value={repository.roleArn ?? "arn:aws:iam::ACCOUNT_ID:role/stfa-verification"} readOnly className="font-mono text-xs" /></Field>
          <div className="flex flex-wrap items-center gap-3"><Button disabled><LockKeyhole aria-hidden="true" />Connect AWS</Button><span className="text-xs text-muted-foreground">AWS onboarding comes in a later phase.</span></div>
        </SettingsCard>
      </div>

      <section aria-labelledby="repository-runs-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><h2 id="repository-runs-heading" className="text-base font-semibold">Recent runs</h2><p className="mt-1 text-xs text-muted-foreground">Latest analyses associated with this repository.</p></div>
          <Link href="/runs" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">All runs <ExternalLink aria-hidden="true" className="size-3" /></Link>
        </div>
        {repositoryRuns.length ? <Card className="overflow-hidden"><RunsTable runs={repositoryRuns} /></Card> : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No mock runs for this repository.</CardContent></Card>}
      </section>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-4 pt-5">{children}</CardContent>
    </Card>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}{hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}</div>;
}
