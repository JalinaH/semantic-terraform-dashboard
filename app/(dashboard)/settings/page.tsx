import Image from "next/image";
import Link from "next/link";
import { Bell, CircleUserRound, ExternalLink, Github, RefreshCw, SlidersHorizontal, type LucideIcon } from "lucide-react";
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

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const userInstallations = await listInstallationsForUser(user.id);
  const repositoryCount = userInstallations.reduce((count, item) => count + item.githubInstallation.repositories.length, 0);
  const avatarUrl = user.avatarUrl ?? user.image;

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Workspace" title="Settings" description="Manage your GitHub identity and installations. Agent defaults and notifications remain non-persisting previews." />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <SettingsSection icon={CircleUserRound} title="Account" description="Authenticated GitHub identity for this dashboard session.">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {avatarUrl ? <Image src={avatarUrl} alt="" width={36} height={36} className="size-9 rounded-full border" /> : <span className="flex size-9 items-center justify-center rounded-full border bg-secondary text-xs font-semibold">{(user.githubLogin ?? user.name ?? "U").slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0"><p className="truncate text-sm font-medium">{user.name ?? user.githubLogin ?? "GitHub user"}</p><p className="truncate text-xs text-muted-foreground">@{user.githubLogin ?? "github"}</p></div>
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
                    <div className="flex items-center gap-2"><span className="text-sm font-medium">{githubInstallation.accountLogin}</span><Badge variant="outline">{githubInstallation.accountType === "ORGANIZATION" ? "Organization" : "Personal"}</Badge></div>
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

          <SettingsSection icon={SlidersHorizontal} title="Default model" description="Applied when a repository has no model override." comingLater>
            <Select defaultValue="gemini-2.5-pro" aria-label="Default model"><option value="gemini-2.5-pro">gemini-2.5-pro</option><option value="gemini-2.5-flash">gemini-2.5-flash</option></Select>
          </SettingsSection>
          <SettingsSection icon={SlidersHorizontal} title="Default context mode" description="Controls the bounded context collected for a diagnosis." comingLater>
            <Select defaultValue="smart" aria-label="Default context mode"><option value="minimal">Minimal</option><option value="smart">Smart</option><option value="full">Full</option></Select>
          </SettingsSection>
          <SettingsSection icon={Bell} title="Notifications" description="Run outcomes and repository health alerts." comingLater>
            <div className="flex items-center gap-3"><Switch label="Run notifications" disabled /><Label className="text-muted-foreground">Run notifications</Label></div>
          </SettingsSection>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">GitHub account and repository access are persisted. Other controls are intentionally unavailable until their product phases.</p>
    </div>
  );
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
