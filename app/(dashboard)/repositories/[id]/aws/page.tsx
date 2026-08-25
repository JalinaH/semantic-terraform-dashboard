import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  FileKey2,
  KeyRound,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
import { AwsGuidedOnboarding } from "@/components/aws-guided-onboarding";
import { AwsDisconnectForm, AwsRegionForm, AwsRoleForm, AwsVerifyForm } from "@/components/aws-onboarding-forms";
import { AwsStatusBadge } from "@/components/aws-status-badge";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getVerificationRoleName } from "@/lib/aws/cloudformation";
import { generateStarterVerificationPolicy, generateTrustPolicy } from "@/lib/aws/policies";
import { DEFAULT_AWS_REGION, getAwsRegionLabel } from "@/lib/aws/regions";
import { getAwsControlPlaneConfiguration, getAwsControlPlaneConfigurationStatus } from "@/lib/config";
import { getAwsGuidedOnboardingConfiguration } from "@/lib/config";
import { getLatestAwsOnboardingSessionForUser } from "@/lib/aws/onboarding-session";
import { prismaAwsOnboardingSessionStore } from "@/lib/data/aws-onboarding-sessions";
import { getRepositoryForUser } from "@/lib/data/repositories";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AwsOnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const repository = await getRepositoryForUser(user.id, id);
  if (!repository) notFound();

  const connection = repository.awsConnection;
  const githubReady = repository.accessible && repository.installation.suspendedAt === null;
  const awsConfiguration = getAwsControlPlaneConfigurationStatus();
  const currentStep = !connection ? 1 : !connection.roleArn ? 2 : connection.status === "CONNECTED" ? 4 : 3;
  const connected = connection?.status === "CONNECTED";
  const latestOnboarding = await getLatestAwsOnboardingSessionForUser(
    prismaAwsOnboardingSessionStore,
    user.id,
    repository.id,
  );
  const guidedConfigured = isGuidedOnboardingConfigured();
  const generatedSetup = connection && awsConfiguration.configured
    ? createGeneratedSetup(repository.id, connection.externalId)
    : null;

  return (
    <div className="space-y-7">
      <div>
        <Link href={`/repositories/${repository.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Repository settings</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs text-muted-foreground">{repository.fullName}</p><AwsStatusBadge status={connection ? connection.status.toLowerCase() as "pending" | "connected" | "verification_failed" | "access_removed" : "not_connected"} /></div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em]">AWS Connection</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">TerraFix uses a customer-controlled IAM role and temporary STS credentials to verify Terraform plans.</p>
          </div>
          <Badge variant="outline" className="w-fit bg-success-muted text-success-foreground"><LockKeyhole aria-hidden="true" className="size-3" />No permanent access keys</Badge>
        </div>
      </div>

      {!githubReady ? <BlockingNotice title="GitHub access unavailable">Restore the installation and repository grant before changing its AWS connection.</BlockingNotice> : null}
      {!repository.config ? <BlockingNotice title="Repository configuration required">Save the Terraform and agent configuration before starting AWS onboarding. <Link href={`/repositories/${repository.id}`} className="font-medium underline">Configure repository</Link></BlockingNotice> : null}

      {connected && connection ? (
        <Card className="border-success/25">
          <CardHeader className="border-b bg-success-muted/50"><div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-success text-white"><Check aria-hidden="true" className="size-4" /></span><div><CardTitle>AWS connected</CardTitle><CardDescription>The role was assumed and its returned identity matched the expected account and role.</CardDescription></div></div></CardHeader>
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="Account" value={connection.awsAccountId ?? "—"} mono />
            <Detail label="Region" value={`${connection.region} · ${getAwsRegionLabel(connection.region)}`} />
            <Detail label="Role" value={roleName(connection.roleArn)} mono />
            <Detail label="Last verified" value={connection.lastVerifiedAt ? formatDate(connection.lastVerifiedAt) : "—"} />
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="guided-aws-heading">
        <Card className={!connected ? "border-foreground/15" : undefined}>
          <CardHeader className="border-b"><CardTitle id="guided-aws-heading">{connected ? "AWS" : "Connect AWS"}</CardTitle><CardDescription>One TerraFix action, one AWS stack confirmation, then automatic role verification.</CardDescription></CardHeader>
          <CardContent className="pt-5">
            <AwsGuidedOnboarding
              repositoryId={repository.id}
              region={connection?.region ?? DEFAULT_AWS_REGION}
              connected={connected}
              configured={guidedConfigured}
              disabled={!githubReady || !repository.config}
              initialSession={latestOnboarding}
            />
            <p className="mt-5 text-[11px] leading-5 text-muted-foreground">TerraFix never asks for or stores AWS access keys. AWS access remains customer-controlled and uses temporary role sessions.</p>
          </CardContent>
        </Card>
      </section>

      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Advanced / Manual setup</summary>
        <div className="space-y-6 border-t p-5">

      <section aria-labelledby="aws-region-heading">
        <Card>
          <CardHeader className="border-b"><div className="flex items-start gap-3"><StepIcon step={1} active={currentStep === 1} complete={Boolean(connection)} /><div><CardTitle id="aws-region-heading">Choose a verification region</CardTitle><CardDescription>Select the default region the hosted verification worker will use for this repository.</CardDescription></div></div></CardHeader>
          <CardContent className="pt-5"><div className="max-w-xl"><AwsRegionForm repositoryId={repository.id} currentRegion={connection?.region ?? DEFAULT_AWS_REGION} started={Boolean(connection)} disabled={!githubReady || !repository.config || connected} /></div>{connected ? <p className="mt-3 text-xs text-muted-foreground">Use Reconnect above to replace a working connection without downtime.</p> : null}</CardContent>
        </Card>
      </section>

      {connection ? (
        <section aria-labelledby="aws-role-heading">
          <Card>
            <CardHeader className="border-b"><div className="flex items-start gap-3"><StepIcon step={2} active={currentStep === 2} complete={Boolean(connection.roleArn)} /><div><CardTitle id="aws-role-heading">Create or provide an IAM role</CardTitle><CardDescription>Use the starter CloudFormation template or an existing role with suitable Terraform plan permissions.</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="rounded-lg border bg-secondary/30 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div><p className="text-xs font-semibold">Repository External ID</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Generated uniquely by the dashboard and required by the trust policy to prevent confused-deputy access.</p><code className="mt-2 block break-all font-mono text-xs">{connection.externalId}</code></div>
                  <CopyButton value={connection.externalId} label="Copy External ID" />
                </div>
              </div>

              {!awsConfiguration.configured ? <BlockingNotice title="AWS control plane not configured">Add the documented server-side AWS region and trusted principal ARN before generating or verifying a role.</BlockingNotice> : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary/50"><FileKey2 aria-hidden="true" className="size-4" /></span><div><h3 className="text-sm font-semibold">Starter CloudFormation setup</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Creates only an IAM role, trust relationship, inline starter verification policy, and resource tags.</p></div></div>
                  {generatedSetup ? <p className="mt-3 font-mono text-[11px] text-muted-foreground">Role name: {generatedSetup.roleName}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {generatedSetup ? <Link href={`/api/repositories/${repository.id}/aws/cloudformation`} className={buttonVariants({ size: "sm" })}><Download aria-hidden="true" />Download CloudFormation template</Link> : <span className={cn(buttonVariants({ size: "sm" }), "pointer-events-none opacity-50")}><Download aria-hidden="true" />Template unavailable</span>}
                  </div>
                  <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-muted-foreground"><li>Open CloudFormation and create a stack with the downloaded template.</li><li>Review the IAM capability and create the stack.</li><li>Copy the <span className="font-mono text-foreground">RoleArn</span> output and paste it below.</li></ol>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary/50"><KeyRound aria-hidden="true" className="size-4" /></span><div><h3 className="text-sm font-semibold">I already have a role</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Use an existing IAM role whose trust relationship contains this principal and External ID.</p></div></div>
                  <div className="mt-4"><AwsRoleForm repositoryId={repository.id} currentRoleArn={connection.roleArn ?? ""} disabled={!githubReady || connected} /></div>
                </div>
              </div>

              {generatedSetup ? (
                <details className="rounded-lg border">
                  <summary className="cursor-pointer px-4 py-3 text-xs font-medium">Review generated trust and starter permission policies</summary>
                  <div className="grid gap-4 border-t p-4 xl:grid-cols-2">
                    <PolicyBlock title="Trust policy" description="Trusts only the configured control-plane principal and this repository External ID." value={generatedSetup.trustPolicy} />
                    <PolicyBlock title="Starter verification policy" description="Read-oriented starter access only. Resource-specific plan permissions may still be required." value={generatedSetup.starterPolicy} />
                  </div>
                </details>
              ) : null}
              <p className="text-xs leading-5 text-warning-foreground">The starter policy is not universal. Terraform providers may call additional APIs during planning, even with <code className="font-mono">-refresh=false</code>. Add only the repository-specific read, describe, list, and unavoidable plan-time calls it needs. AdministratorAccess is not recommended.</p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {connection?.roleArn ? (
        <section aria-labelledby="aws-verify-heading">
          <Card>
            <CardHeader className="border-b"><div className="flex items-start gap-3"><StepIcon step={3} active={currentStep === 3} complete={connected} /><div><CardTitle id="aws-verify-heading">Verify the connection</CardTitle><CardDescription>The server assumes the role for 15 minutes, calls STS GetCallerIdentity, verifies the account and role, then discards the credentials.</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-3 sm:grid-cols-3"><Detail label="Region" value={connection.region} mono /><Detail label="Role ARN" value={connection.roleArn} mono /><Detail label="Status" value={formatStatus(connection.status)} /></div>
              {connection.verificationError ? <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{connection.verificationError}</span></div> : null}
              <AwsVerifyForm repositoryId={repository.id} connected={connected} disabled={!awsConfiguration.configured || !githubReady} />
            </CardContent>
          </Card>
        </section>
      ) : null}

      {connection ? (
        <section aria-labelledby="disconnect-heading">
          <Card>
            <CardHeader className="border-b"><CardTitle id="disconnect-heading">Disconnect AWS</CardTitle><CardDescription>Removes this dashboard connection. It does not make changes in the customer AWS account.</CardDescription></CardHeader>
            <CardContent className="pt-5"><AwsDisconnectForm repositoryId={repository.id} disabled={!githubReady} /></CardContent>
          </Card>
        </section>
      ) : null}

        </div>
      </details>
    </div>
  );
}

function isGuidedOnboardingConfigured() {
  try {
    getAwsGuidedOnboardingConfiguration();
    return true;
  } catch {
    return false;
  }
}

function createGeneratedSetup(repositoryId: string, externalId: string) {
  const { principalArn } = getAwsControlPlaneConfiguration();
  return {
    roleName: getVerificationRoleName(repositoryId),
    trustPolicy: JSON.stringify(generateTrustPolicy(principalArn, externalId), null, 2),
    starterPolicy: JSON.stringify(generateStarterVerificationPolicy(), null, 2),
  };
}

function StepIcon({ step, active, complete }: { step: number; active: boolean; complete: boolean }) {
  return <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs", active && "border-foreground/30 bg-primary text-primary-foreground", complete && "border-success/30 bg-success text-white")}>{complete ? <Check aria-hidden="true" className="size-3.5" /> : step}</span>;
}

function BlockingNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-muted p-4"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" /><p className="text-xs leading-5"><span className="font-medium">{title}.</span> <span className="text-muted-foreground">{children}</span></p></div>;
}

function PolicyBlock({ title, description, value }: { title: string; description: string; value: string }) {
  return <div className="min-w-0"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p></div><CopyButton value={value} label={`Copy ${title}`} /></div><pre className="scrollbar-thin mt-3 max-h-80 overflow-auto rounded-lg border bg-background p-3 font-mono text-[10px] leading-5"><code>{value}</code></pre></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-lg border bg-secondary/30 px-3.5 py-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn("mt-1 break-words text-xs font-medium", mono && "font-mono")}>{value}</p></div>;
}

function roleName(roleArn: string | null) { return roleArn?.split("/").at(-1) ?? "—"; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function formatStatus(value: string) { return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
