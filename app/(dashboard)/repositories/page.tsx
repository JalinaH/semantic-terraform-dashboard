import Link from "next/link";
import { CheckCircle2, ExternalLink, FolderGit2, Github, RefreshCw, TriangleAlert } from "lucide-react";
import { beginGitHubInstallationAction, syncRepositoriesAction } from "@/app/actions/github";
import { ConnectedRepositoryCard } from "@/components/connected-repository-card";
import { EmptyState } from "@/components/empty-state";
import { PageIntro } from "@/components/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getGitHubErrorMessage } from "@/lib/github/errors";
import { listInstallationsForUser } from "@/lib/github/installations";
import { getGitHubInstallationManagementUrl } from "@/lib/github/urls";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface RepositoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RepositoriesPage({ searchParams }: RepositoriesPageProps) {
  const user = await requireAuthenticatedUser();
  const [params, userInstallations] = await Promise.all([
    searchParams,
    listInstallationsForUser(user.id, { includeInaccessible: true }),
  ]);
  const error = singleValue(params.error);
  const connected = singleValue(params.github) === "connected";
  const synced = singleValue(params.synced);
  const removed = singleValue(params.removed);
  const repositoryCount = userInstallations.reduce(
    (total, { githubInstallation }) => total + githubInstallation.repositories.filter((repository) => repository.accessible).length,
    0,
  );

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="GitHub access"
        title="Repositories"
        description="Configure repositories granted to the GitHub App. Removed grants remain visible so saved settings and future history are preserved."
        action={
          <form action={beginGitHubInstallationAction}>
            <input type="hidden" name="returnTo" value="/repositories" />
            <Button type="submit"><Github aria-hidden="true" />Install on another account</Button>
          </form>
        }
      />

      {error ? <Notice tone="error" title="GitHub operation failed">{getGitHubErrorMessage(error)}</Notice> : null}
      {connected ? <Notice tone="success" title="GitHub App connected">The installation was verified and its granted repositories were synchronized.</Notice> : null}
      {synced !== undefined ? <Notice tone="success" title="Repositories synchronized">GitHub reports {synced} accessible repositor{synced === "1" ? "y" : "ies"}. {Number(removed) > 0 ? `${removed} removed grant${removed === "1" ? " was" : "s were"} marked inaccessible.` : "No repository grants were removed."}</Notice> : null}

      {userInstallations.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No repositories connected"
          description="Install the GitHub App to select repositories for Semantic Terraform Agent. You can install it on a personal account or an organization where you have permission."
          action={<form action={beginGitHubInstallationAction}><input type="hidden" name="returnTo" value="/repositories" /><Button type="submit"><Github aria-hidden="true" />Install GitHub App</Button></form>}
        />
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>{repositoryCount} accessible repositor{repositoryCount === 1 ? "y" : "ies"}</span>
            <span>{userInstallations.length} installation{userInstallations.length === 1 ? "" : "s"}</span>
          </div>
          {userInstallations.map(({ githubInstallation }) => {
            const manageUrl = getGitHubInstallationManagementUrl(githubInstallation.installationId, githubInstallation.htmlUrl);
            return (
              <section key={githubInstallation.id} aria-labelledby={`installation-${githubInstallation.id}`} className="space-y-4">
                <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-end">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id={`installation-${githubInstallation.id}`} className="text-sm font-semibold">{githubInstallation.accountLogin}</h2>
                      <Badge variant="outline">{githubInstallation.accountType === "ORGANIZATION" ? "Organization" : "Personal account"}</Badge>
                      <Badge variant="outline">{githubInstallation.repositorySelection === "ALL" ? "All repositories" : "Selected repositories"}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{githubInstallation.repositories.filter((repository) => repository.accessible).length} accessible repositor{githubInstallation.repositories.filter((repository) => repository.accessible).length === 1 ? "y" : "ies"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={syncRepositoriesAction}>
                      <input type="hidden" name="installationDatabaseId" value={githubInstallation.id} />
                      <Button type="submit" size="sm" variant="outline"><RefreshCw aria-hidden="true" />Sync repositories</Button>
                    </form>
                    <Link href={manageUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>Manage on GitHub <ExternalLink aria-hidden="true" /></Link>
                  </div>
                </div>
                {githubInstallation.repositories.length ? (
                  <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {githubInstallation.repositories.map((repository) => <ConnectedRepositoryCard key={repository.id} repository={repository} accountLogin={githubInstallation.accountLogin} />)}
                  </div>
                ) : (
                  <EmptyState icon={FolderGit2} title="No repositories granted" description="Manage this installation on GitHub to grant one or more repositories, then synchronize again." />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Notice({ tone, title, children }: { tone: "success" | "error"; title: string; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3", tone === "success" ? "border-success/20 bg-success-muted" : "border-destructive/25 bg-destructive/5")}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", tone === "success" ? "text-success-foreground" : "text-destructive")} />
      <p className="text-xs leading-5"><span className="font-medium">{title}.</span> <span className="text-muted-foreground">{children}</span></p>
    </div>
  );
}
