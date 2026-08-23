import Link from "next/link";
import { ArrowLeft, CheckCircle2, Github, LockKeyhole } from "lucide-react";
import { beginGitHubInstallationAction } from "@/app/actions/github";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntegrationConfigurationStatus } from "@/lib/config";
import { cn } from "@/lib/utils";

export default function GitHubInstallPage() {
  const configuration = getIntegrationConfigurationStatus();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/repositories" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Repositories</Link>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Repository access</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Install the GitHub App</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">GitHub will ask which personal account or organization should install TerraFix, then let you grant all repositories or a selected set.</p>
      </div>
      <Card>
        <CardHeader className="border-b"><CardTitle>What TerraFix can access</CardTitle><CardDescription>The App reads CI and repository context, publishes diagnoses, and can write one verified source commit only after explicit approval.</CardDescription></CardHeader>
        <CardContent className="space-y-4 pt-5">
          {["Actions: Read for failed Terraform CI evidence", "Pull requests: Write for one idempotent diagnosis comment", "Contents: Write for an explicitly approved verified patch commit", "Metadata: Read for installation and repository access"].map((item) => <div key={item} className="flex items-center gap-3 text-sm"><CheckCircle2 aria-hidden="true" className="size-4 text-success-foreground" />{item}</div>)}
          <div className="flex items-start gap-3 rounded-lg border bg-secondary/35 p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><p>Installation tokens are generated only on the server and expire. No personal access token, private key, or OAuth token is sent to the browser.</p></div>
          {configuration.githubApp ? (
            <form action={beginGitHubInstallationAction}><input type="hidden" name="returnTo" value="/repositories" /><Button type="submit" size="lg"><Github aria-hidden="true" />Continue to GitHub</Button></form>
          ) : (
            <div className="space-y-2"><Button disabled size="lg"><Github aria-hidden="true" />GitHub App not configured</Button><p className="text-xs text-warning-foreground">Complete the local GitHub App environment setup before starting an installation.</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
