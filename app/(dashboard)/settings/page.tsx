import Image from "next/image";
import Link from "next/link";
import { Bell, CircleUserRound, Cloud, ExternalLink, Github, RefreshCw, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { beginGitHubInstallationAction, syncRepositoriesAction } from "@/app/actions/github";
import { PageIntro } from "@/components/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { listInstallationsForUser } from "@/lib/github/installations";
import { getGitHubInstallationManagementUrl } from "@/lib/github/urls";
import { cn } from "@/lib/utils";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const userInstallations = await listInstallationsForUser(user.id);
  const repositoryCount = userInstallations.reduce((count, item) => count + item.githubInstallation.repositories.length, 0);
  const awsConnectedCount = userInstallations.reduce((count, item) => count + item.githubInstallation.repositories.filter((repository) => repository.awsConnection?.status === "CONNECTED").length, 0);
  const avatarUrl = user.avatarUrl ?? user.image;

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Workspace" title="Settings" description="Manage GitHub identity and installations. Repository-specific configuration remains authoritative." />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <SettingsSection icon={CircleUserRound} title="Account" description="Authenticated GitHub identity for this dashboard session.">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {avatarUrl ? <Image src={avatarUrl} alt="" width={36} height={36} className="size-9 rounded-full border" /> : <span className="flex size-9 items-center justify-center rounded-full border bg-secondary text-xs font-semibold">{(user.githubLogin ?? user.name ?? "U").slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0"><p className="truncate text-sm font-medium">{user.name ?? user.githubLogin ?? "GitHub user"}</p><p className="truncate text-xs text-muted-foreground">@{user.githubLogin ?? "github"}</p></div>
            </div>
          </SettingsSection>

          <SettingsSection icon={Cloud} title="AWS" description="Repository-scoped AWS access for provider-authenticated Terraform verification.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs"><span className="text-muted-foreground">Verified repository connections</span><span className="font-medium">{awsConnectedCount} of {repositoryCount}</span></div>
              <div className="rounded-lg border bg-secondary/30 p-3 text-xs leading-5 text-muted-foreground"><p><span className="font-medium text-foreground">Temporary credentials only.</span> Semantic Terraform Agent assumes a repository-specific IAM role with an External ID. Permanent AWS access keys are never requested.</p></div>
              <Link href="/repositories" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit")}>Manage repository connections</Link>
            </div>
          </SettingsSection>

          <SettingsSection icon={Github} title="GitHub" description="Verified App installations and repository grants.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs">
                <span className="text-muted-foreground">Connected installations</span>
                <span className="font-medium">{userInstallations.length} · {repositoryCount} repositor{repositoryCount === 1 ? "y" : "ies"}</span>
              </div>
              {userInstallations.map(({ githubInstallation }) => (
                <div key={githubInstallation.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{githubInstallation.accountLogin}</span><Badge variant="outline">{githubInstallation.accountType === "ORGANIZATION" ? "Organization" : "Personal"}</Badge><Badge variant="outline" className={githubInstallation.pullRequestsPermission === "write" ? "border-success/25 bg-success-muted text-success-foreground" : "border-warning/25 bg-warning-muted text-warning-foreground"}>{githubInstallation.pullRequestsPermission === "write" ? "PR publication ready" : "Permission upgrade required"}</Badge></div>
                    <span className="text-xs text-muted-foreground">{githubInstallation.repositories.length} repositories</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={syncRepositoriesAction}><input type="hidden" name="installationDatabaseId" value={githubInstallation.id} /><Button type="submit" size="sm" variant="outline"><RefreshCw aria-hidden="true" />Sync</Button></form>
                    <Link href={getGitHubInstallationManagementUrl(githubInstallation.installationId, githubInstallation.htmlUrl)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>Manage <ExternalLink aria-hidden="true" /></Link>
                  </div>
                </div>
              ))}
              <form action={beginGitHubInstallationAction}><input type="hidden" name="returnTo" value="/settings" /><Button type="submit" variant="outline"><Github aria-hidden="true" />Install on another account</Button></form>
            </div>
          </SettingsSection>

          <SettingsSection icon={SlidersHorizontal} title="Repository defaults" description="Preview values used when a repository has not been configured. Per-repository settings remain authoritative." comingLater>
            <div className="grid gap-3 sm:grid-cols-2">
              <DefaultSelect label="Terraform version" value={REPOSITORY_CONFIG_DEFAULTS.terraformVersion}><option value={REPOSITORY_CONFIG_DEFAULTS.terraformVersion}>{REPOSITORY_CONFIG_DEFAULTS.terraformVersion}</option></DefaultSelect>
              <DefaultSelect label="Model" value={REPOSITORY_CONFIG_DEFAULTS.model}><option value={REPOSITORY_CONFIG_DEFAULTS.model}>{REPOSITORY_CONFIG_DEFAULTS.model}</option></DefaultSelect>
              <DefaultSelect label="Context mode" value={REPOSITORY_CONFIG_DEFAULTS.contextMode}><option value="auto">Auto</option><option value="lightweight">Lightweight</option><option value="schema-aware">Schema-aware</option></DefaultSelect>
              <DefaultSelect label="Repair attempts" value={String(REPOSITORY_CONFIG_DEFAULTS.maxRepairAttempts)}><option value="0">0</option><option value="1">1</option></DefaultSelect>
            </div>
          </SettingsSection>
          <SettingsSection icon={Bell} title="Notifications" description="Run outcomes and repository health alerts." comingLater>
            <div className="flex items-center gap-3"><Switch label="Run notifications" disabled /><Label className="text-muted-foreground">Run notifications</Label></div>
          </SettingsSection>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">GitHub access, repository configuration, and verified AWS connection metadata are persisted. Temporary STS credentials are never stored.</p>
    </div>
  );
}

function DefaultSelect({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  const id = `default-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select id={id} defaultValue={value} disabled>{children}</Select></div>;
}

function SettingsSection({ icon: Icon, title, description, comingLater = false, children }: { icon: LucideIcon; title: string; description: string; comingLater?: boolean; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b p-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] md:items-start md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground"><Icon aria-hidden="true" className="size-4" /></span>
        <div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{comingLater ? <Badge variant="outline" className="bg-neutral-status-muted text-neutral-status">Coming later</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      </div>
      <div className="md:justify-self-stretch">{children}</div>
    </section>
  );
}
