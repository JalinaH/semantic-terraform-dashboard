import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, CheckCircle2, Circle, Cloud, ExternalLink, GitBranch, GitPullRequestArrow, TriangleAlert } from "lucide-react";
import { AwsStatusBadge } from "@/components/aws-status-badge";
import { TokenTrendChart } from "@/components/analytics/usage-trend-charts";
import { EmptyState } from "@/components/empty-state";
import { RepositoryConfigurationForm } from "@/components/repository-configuration-form";
import { RepositoryConfigStatusBadge } from "@/components/repository-config-status-badge";
import { RepositoryRemovalButton } from "@/components/repository-removal-button";
import { RunPoller } from "@/components/run-poller";
import { RunsTable } from "@/components/runs-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { formatCompactTokens, formatPercent, formatUsd } from "@/lib/analytics/format";
import { getUsageAnalytics } from "@/lib/analytics/trends";
import { getCatalogViewForUser } from "@/lib/model-policy/catalog";
import { isModelPolicyReady } from "@/lib/model-policy/readiness";
import { getRepositoryForUser } from "@/lib/data/repositories";
import { listAgentRunsForUser } from "@/lib/data/runs";
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
  const [recentRuns, usage, catalog] = await Promise.all([
    listAgentRunsForUser(user.id, { repositoryId: repository.id }, 5),
    getUsageAnalytics({ userId: user.id, period: "30d", repositoryId: repository.id }),
    getCatalogViewForUser(user.id),
  ]);

  const config = repository.config ? toRepositoryConfigInput(repository.config) : REPOSITORY_CONFIG_DEFAULTS;
  const modelPolicyReady = isModelPolicyReady(repository.config ? toRepositoryConfigInput(repository.config) : null, catalog.models, catalog.access);
  const githubReady = repository.accessible && repository.installation.suspendedAt === null;
  const status = getRepositoryConfigStatus(repository.config, repository.awsConnection, githubReady, modelPolicyReady);
  const awsConnected = repository.awsConnection?.status === "CONNECTED";
  const manageUrl = getGitHubInstallationManagementUrl(repository.installation.installationId, repository.installation.htmlUrl);

  return (
    <div className="space-y-7">
      <RunPoller active={recentRuns.some((run) => run.status === "queued" || run.status === "running")} />
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
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">Configure which Terraform workflow failures can dispatch the hosted TerraFix worker.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>View on GitHub <ExternalLink aria-hidden="true" /></Link>{githubReady ? <RepositoryRemovalButton repositoryId={repository.id} repositoryName={repository.fullName} /> : null}</div>
        </div>
      </div>

      {!githubReady ? (
        <div role="alert" className="flex flex-col justify-between gap-4 rounded-xl border border-warning/25 bg-warning-muted p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <div><p className="text-sm font-medium">GitHub access unavailable</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The installation is suspended or this repository is no longer granted. Saved configuration is preserved until access is restored.</p></div>
          </div>
          <Link href={manageUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit bg-background")}>Manage GitHub access <ExternalLink aria-hidden="true" /></Link>
        </div>
      ) : null}

      {githubReady && status === "attention" ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div><p className="text-sm font-medium">{config.modelRouting === "fixed" ? "Configured model unavailable" : "Model setup required"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{config.modelRouting === "fixed" ? "The selected model is no longer enabled, available, compatible, or allowed. TerraFix will not silently switch it; choose another model or Auto Optimize." : "No eligible model is currently available within this repository’s maximum tier. Review the catalog and model policy before the next run."}</p></div>
        </div>
      ) : null}

      {githubReady && repository.installation.pullRequestsPermission !== "write" ? (
        <div role="alert" className="flex flex-col justify-between gap-4 rounded-xl border border-warning/25 bg-warning-muted p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <div><p className="text-sm font-medium">GitHub permission upgrade required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">TerraFix needs Pull requests: Write to publish evidence-backed diagnoses directly to pull requests.</p></div>
          </div>
          <Link href={manageUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit bg-background")}>Review GitHub App permissions <ExternalLink aria-hidden="true" /></Link>
        </div>
      ) : null}

      {githubReady && repository.installation.contentsPermission !== "write" ? (
        <div role="alert" className="flex flex-col justify-between gap-4 rounded-xl border border-warning/25 bg-warning-muted p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" /><div><p className="text-sm font-medium">Apply-to-PR permission upgrade required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Approve Contents: Write to let TerraFix commit an already verified patch only after explicit dashboard confirmation.</p></div></div>
          <Link href={manageUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit bg-background")}>Review GitHub App permissions <ExternalLink aria-hidden="true" /></Link>
        </div>
      ) : null}

      <section aria-labelledby="setup-heading">
        <Card>
          <CardHeader className="border-b"><CardTitle id="setup-heading">Setup</CardTitle><CardDescription>Complete the required prerequisites. Cloud verification is an optional enhancement.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <SetupItem label="GitHub connected" complete={githubReady} href={manageUrl} external />
            <SetupItem label="Terraform configured" complete={Boolean(repository.config)} href="#configuration-heading" />
            <SetupItem label="AI model policy valid" complete={modelPolicyReady} href="#configuration-heading" />
            <SetupItem label="TerraFix enabled" complete={Boolean(repository.config?.enabled)} href="#configuration-heading" />
            <div className="sm:col-span-2 xl:col-span-4"><SetupItem label={`Cloud verification · ${awsConnected ? "AWS connected" : "Optional · Connect AWS"}`} complete={awsConnected} href={`/repositories/${repository.id}/aws`} /></div>
          </CardContent>
        </Card>
      </section>

      {status === "ready" ? <div role="status" className="rounded-xl border border-success/25 bg-success-muted p-4"><p className="flex items-center gap-2 text-sm font-medium text-success-foreground"><CheckCircle2 aria-hidden="true" className="size-4" />TerraFix is ready.</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Open or update a pull request containing Terraform changes. TerraFix diagnoses CI failures read-only; an eligible verified source patch can be committed only after explicit approval. TerraFix never runs Terraform apply or merges the PR.</p></div> : null}

      <section aria-labelledby="configuration-summary-heading">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle id="configuration-summary-heading">Integration summary</CardTitle><CardDescription>Ready means GitHub access, saved Terraform configuration, a valid model policy, and an enabled agent. AWS enhances verification but is optional.</CardDescription></div>
              <RepositoryConfigStatusBadge status={status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryItem label="GitHub" value={githubReady ? "Connected" : "Access unavailable"} />
            <SummaryItem label="Configuration" value={repository.config ? "Saved" : "Not saved"} />
            <SummaryItem label="Cloud verification" value={awsConnected ? "AWS connected · Full" : "Optional · Local"} />
            <SummaryItem label="Agent" value={config.enabled ? "Enabled" : "Disabled"} />
            <SummaryItem label="Status" value={formatLabel(status)} />
            <SummaryItem label="Terraform root" value={config.terraformDir} mono />
            <SummaryItem label="Terraform version" value={config.terraformVersion} mono />
            <SummaryItem label="Model policy" value={config.modelRouting === "auto" ? "Auto Optimize" : "Fixed"} />
            <SummaryItem label={config.modelRouting === "auto" ? "Maximum tier" : "Model"} value={config.modelRouting === "auto" ? config.maxModelTier.toUpperCase() : config.fixedModelId ?? config.model} mono={config.modelRouting === "fixed"} />
            <SummaryItem label="Context" value={formatLabel(config.contextMode)} />
            <SummaryItem label="Repair attempts" value={String(config.maxRepairAttempts)} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repository-usage-heading">
        <div className="mb-3 flex items-end justify-between gap-4"><div><h2 id="repository-usage-heading" className="text-base font-semibold">AI Usage</h2><p className="mt-1 text-xs text-muted-foreground">Last 30 days · provider-reported usage for this repository.</p></div><Link href={`/usage?period=30d&repository=${repository.id}`} className="text-xs font-medium text-primary hover:underline">View detailed usage</Link></div>
        {usage && usage.current.runCount ? <div className="space-y-4"><Card><CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 lg:grid-cols-4"><UsageItem label="Runs" value={usage.current.runCount.toLocaleString()} /><UsageItem label="Tokens" value={usage.current.tokenCompleteRuns ? formatCompactTokens(usage.current.totalTokens) : "Not reported"} /><UsageItem label="AI spend" value={usage.current.costCompleteRuns ? formatUsd(usage.current.aiSpendUsd) : "Not reported"} detail={`${usage.current.costCompleteRuns}/${usage.current.completedRunCount} complete`} /><UsageItem label="Fully verified" value={usage.current.verifiedFixes.toLocaleString()} /><UsageItem label="Locally validated" value={usage.current.locallyValidated.toLocaleString()} /><UsageItem label="Full verification rate" value={formatPercent(usage.current.verificationRate)} /><UsageItem label="Schema avoided" value={formatPercent(usage.current.schemaAvoidanceRate)} /><UsageItem label="Memory reuse" value={formatPercent(usage.current.memoryReuseRate)} /></CardContent></Card><TokenTrendChart data={usage.daily} compact /></div> : <EmptyState icon={BrainCircuit} title="No usage data yet" description="TerraFix will show repository token, cost, and optimization metrics after the first diagnosis." />}
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
        <div className="mb-3"><h2 id="configuration-heading" className="text-base font-semibold">Repository configuration</h2><p className="mt-1 text-xs text-muted-foreground">Saved workflow names, path filters, stages, model, context, and bounded repair behavior control hosted dispatch.</p></div>
        <RepositoryConfigurationForm repositoryId={repository.id} initialConfig={config} initialStatus={status} awsConnected={awsConnected} disabled={!githubReady} maximumAllowedTier={catalog.access.maximumTier} catalogLastSyncedAt={catalog.sync?.lastSuccessfulAt?.toISOString() ?? null} catalogPricingMayBeStale={catalog.pricingMayBeStale} modelCatalog={catalog.models.filter((model) => model.tier !== null && (model.supportsStructuredOutput || model.supportsJsonFallback)).map((model) => ({ modelId: model.modelId, displayName: model.displayName, upstreamProvider: model.upstreamProvider, tier: model.tier!, allowed: model.allowed, available: model.available && model.enabled, recommended: model.recommended, isFree: model.isFree, contextLength: model.contextLength, pricingPromptPerMillion: model.pricingPromptPerMillion, pricingOutputPerMillion: model.pricingOutputPerMillion }))} />
        <div className="mt-3 rounded-lg border bg-secondary/25 px-4 py-3 text-xs"><span className="font-medium">Usage policy</span><span className="ml-2 text-muted-foreground">Current model policy: {config.modelRouting === "auto" ? `Auto Optimize · maximum ${config.maxModelTier.toUpperCase()}` : `Fixed · ${config.fixedModelId ?? config.model}`}.</span></div>
      </section>

      <section aria-labelledby="aws-heading">
        <Card>
          <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle id="aws-heading">Cloud Verification</CardTitle><CardDescription>Optional AWS connection for provider-aware Terraform plan verification.</CardDescription></div><AwsStatusBadge status={repository.awsConnection ? repository.awsConnection.status.toLowerCase() as "pending" | "connected" | "verification_failed" | "access_removed" : "not_connected"} /></div></CardHeader>
          <CardContent className="flex flex-col justify-between gap-5 pt-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md border bg-neutral-status-muted text-neutral-status"><Cloud aria-hidden="true" className="size-4" /></span>
              <div><p className="text-sm font-medium">{awsConnected ? "AWS connected · Full verification enabled" : "Optional · AWS not connected"}</p><p className="mt-0.5 text-xs text-muted-foreground">TerraFix works without AWS using isolated local Terraform validation. Connect AWS to enable provider-aware <code>terraform plan</code>. Permanent access keys are never requested or stored.</p></div>
            </div>
            {repository.awsConnection ? <div className="grid gap-2 text-xs sm:grid-cols-3"><MiniDetail label="Account" value={maskAccount(repository.awsConnection.awsAccountId)} /><MiniDetail label="Region" value={repository.awsConnection.region} /><MiniDetail label="Role" value={repository.awsConnection.roleArn?.split("/").at(-1) ?? "Waiting for role"} /></div> : null}
            <Link href={`/repositories/${repository.id}/aws`} className={cn(buttonVariants({ variant: awsConnected ? "outline" : "default" }), "w-fit")}>{awsConnected ? "Manage AWS connection" : "Connect AWS"}</Link>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repository-runs-heading">
        <div className="mb-3"><h2 id="repository-runs-heading" className="text-base font-semibold">Recent runs</h2><p className="mt-1 text-xs text-muted-foreground">Signed workflow failures and their hosted execution outcomes.</p></div>
        <Card><CardContent className="p-0">{recentRuns.length ? <RunsTable runs={recentRuns} /> : <EmptyState icon={GitPullRequestArrow} title={status === "ready" ? "Waiting for Terraform CI activity" : "No runs recorded"} description={status === "ready" ? "TerraFix is listening for a failed configured GitHub Actions workflow containing Terraform validate or plan evidence." : "Complete repository setup. A run appears after your existing Terraform CI fails and passes the readiness gates."} />}</CardContent></Card>
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
  return value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-md bg-secondary/40 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-0.5 max-w-36 truncate font-mono font-medium">{value}</p></div>;
}

function maskAccount(value: string | null) {
  return value ? `${value.slice(0, 4)}••••${value.slice(-4)}` : "—";
}

function UsageItem({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="min-w-0 bg-card p-4"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1.5 font-mono text-lg font-semibold">{value}</p>{detail ? <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p> : null}</div>; }

function SetupItem({ label, complete, href, external = false }: { label: string; complete: boolean; href: string; external?: boolean }) {
  const Icon = complete ? CheckCircle2 : Circle;
  return <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="flex items-center gap-2.5 rounded-lg border px-3 py-3 text-xs transition-colors hover:bg-secondary/40"><Icon aria-hidden="true" className={cn("size-4 shrink-0", complete ? "text-success-foreground" : "text-muted-foreground")} /><span className={complete ? "font-medium" : "text-muted-foreground"}>{label}</span></Link>;
}
