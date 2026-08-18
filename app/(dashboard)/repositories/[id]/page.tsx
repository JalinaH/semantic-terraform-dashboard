import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cloud, ExternalLink, GitBranch, LockKeyhole, TriangleAlert } from "lucide-react";
import { RepositoryConfigurationForm } from "@/components/repository-configuration-form";
import { RepositoryConfigStatusBadge } from "@/components/repository-config-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getRepositoryForUser } from "@/lib/data/repositories";
import { getGitHubInstallationManagementUrl } from "@/lib/github/urls";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import { toRepositoryConfigInput } from "@/lib/repository-config/mapper";
import { getRepositoryConfigStatus } from "@/lib/repository-config/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RepositoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const repository = await getRepositoryForUser(user.id, id);
  if (!repository) notFound();

  const config = repository.config ? toRepositoryConfigInput(repository.config) : REPOSITORY_CONFIG_DEFAULTS;
  const status = getRepositoryConfigStatus(repository.config);
  const awsConnected = repository.awsConnection?.status === "CONNECTED";
  const manageUrl = getGitHubInstallationManagementUrl(repository.installation.installationId, repository.installation.htmlUrl);

  return (
    <div className="space-y-7">
      <div>
        <Link href="/repositories" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Repositories</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">Granted through {repository.installation.accountLogin}</p>
              <Badge variant="outline">{repository.private ? "Private" : "Public"}</Badge>
              <RepositoryConfigStatusBadge status={status} />
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em]">{repository.fullName}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">Configure how this repository will invoke the Semantic Terraform Agent engine in a later execution phase.</p>
          </div>
          <Link href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>View on GitHub <ExternalLink aria-hidden="true" /></Link>
        </div>
      </div>

      {!repository.accessible ? (
        <div role="alert" className="flex flex-col justify-between gap-4 rounded-xl border border-warning/25 bg-warning-muted p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <div><p className="text-sm font-medium">GitHub access removed</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The saved configuration is preserved, but it cannot be edited until this repository is granted to the GitHub App again.</p></div>
          </div>
          <Link href={manageUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit bg-background")}>Manage GitHub access <ExternalLink aria-hidden="true" /></Link>
        </div>
      ) : null}

      <section aria-labelledby="configuration-summary-heading">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle id="configuration-summary-heading">Configuration summary</CardTitle><CardDescription>Operational readiness remains gated on AWS onboarding in Phase 4.</CardDescription></div>
              <RepositoryConfigStatusBadge status={status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Agent" value={config.enabled ? "Enabled" : "Disabled"} />
            <SummaryItem label="Terraform root" value={config.terraformDir} mono />
            <SummaryItem label="Terraform version" value={config.terraformVersion} mono />
            <SummaryItem label="Model" value={config.model} mono />
            <SummaryItem label="Context" value={formatLabel(config.contextMode)} />
            <SummaryItem label="Repair attempts" value={String(config.maxRepairAttempts)} />
            <SummaryItem label="Triggers" value={[config.triggerOnPullRequest && "Pull request", config.triggerOnPush && "Push"].filter(Boolean).join(" + ") || "None"} />
            <SummaryItem label="AWS" value={awsConnected ? "Connected" : "Required before ready"} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repository-identity-heading">
        <Card>
          <CardHeader className="border-b"><CardTitle id="repository-identity-heading">Repository identity</CardTitle><CardDescription>Read-only metadata synchronized from the verified GitHub App installation.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
            <IdentityItem label="Repository" value={repository.fullName} />
            <IdentityItem label="Default branch" value={repository.defaultBranch} icon={<GitBranch aria-hidden="true" className="size-3.5" />} />
            <IdentityItem label="Installation account" value={repository.installation.accountLogin} />
            <IdentityItem label="GitHub repository ID" value={repository.githubRepositoryId} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="configuration-heading">
        <div className="mb-3"><h2 id="configuration-heading" className="text-base font-semibold">Repository configuration</h2><p className="mt-1 text-xs text-muted-foreground">These settings persist to PostgreSQL. They do not run Terraform or invoke the Python agent.</p></div>
        <RepositoryConfigurationForm repositoryId={repository.id} initialConfig={config} initialStatus={status} disabled={!repository.accessible} />
      </section>

      <section aria-labelledby="aws-heading">
        <Card>
          <CardHeader className="border-b"><CardTitle id="aws-heading">AWS connection</CardTitle><CardDescription>Temporary verification access without permanent AWS credentials.</CardDescription></CardHeader>
          <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md border bg-neutral-status-muted text-neutral-status"><Cloud aria-hidden="true" className="size-4" /></span>
              <div><p className="text-sm font-medium">{awsConnected ? "Connected" : "Not connected"}</p><p className="mt-0.5 text-xs text-muted-foreground">AWS onboarding and readiness transition arrive in Phase 4.</p></div>
            </div>
            <button type="button" disabled className={cn(buttonVariants({ variant: "outline" }), "w-fit")}><LockKeyhole aria-hidden="true" />Connect AWS</button>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repository-runs-heading">
        <div className="mb-3"><h2 id="repository-runs-heading" className="text-base font-semibold">Recent runs</h2><p className="mt-1 text-xs text-muted-foreground">No execution or automatic run ingestion exists in Phase 3.</p></div>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{repository.agentRuns.length ? `${repository.agentRuns.length} persisted runs` : "No runs recorded for this repository."}</CardContent></Card>
      </section>
    </div>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 bg-card px-4 py-3.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn("mt-1 truncate text-xs font-medium", mono && "font-mono")}>{value}</p></div>;
}

function IdentityItem({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="min-w-0 rounded-lg border bg-secondary/30 px-3.5 py-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 flex items-center gap-1.5 truncate font-mono text-xs font-medium">{icon}{value}</p></div>;
}

function formatLabel(value: string) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
