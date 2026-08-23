import Link from "next/link";
import { ArrowRight, Check, CircleDashed, Github, TerminalSquare } from "lucide-react";
import { auth } from "@/auth";
import { signInWithGitHubAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { ServerActionButton } from "@/components/server-action-button";
import { TerraFixLogo } from "@/components/terrafix-logo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getHostedExecutionConfigurationStatus, getIntegrationConfigurationStatus } from "@/lib/config";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const session = await auth();
  const configuration = getIntegrationConfigurationStatus();
  const hostedExecution = getHostedExecutionConfigurationStatus();
  const { auth: authState } = await searchParams;
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="code-grid pointer-events-none absolute inset-0 opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <header className="relative z-10 mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2">
          <TerraFixLogo size={32} priority />
          <span className="text-sm font-semibold tracking-tight">TerraFix</span>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden bg-card/70 text-muted-foreground sm:inline-flex">Hosted MVP</Badge>
          <ThemeToggle />
          {session?.user ? <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}>Dashboard</Link> : null}
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 pb-16 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:gap-20 lg:pb-24 lg:pt-32">
        <section>
          <Badge variant="outline" className="bg-card/70 text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />Hosted failure automation</Badge>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[3.55rem]">
            Turn Terraform failures into <span className="text-muted-foreground">verified evidence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            TerraFix observes failed GitHub Actions Terraform CI, generates bounded candidate suggestions, and verifies them in isolation for human review.
          </p>
          {authState === "required" ? <p className="mt-5 max-w-xl rounded-lg border border-warning/20 bg-warning-muted px-4 py-3 text-sm text-warning-foreground">Continue with GitHub to access the protected dashboard.</p> : null}
          {authState === "configuration" || !configuration.authentication ? <p className="mt-5 max-w-xl rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">GitHub sign-in is not configured.</span> Add the documented GitHub App environment values to enable authentication.</p> : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {session?.user ? (
              <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}>Open Dashboard <ArrowRight aria-hidden="true" /></Link>
            ) : (
              <form action={signInWithGitHubAction}>
                <input type="hidden" name="returnTo" value="/dashboard" />
                {configuration.authentication ? <ServerActionButton size="lg" className="w-full sm:w-fit" label="Continue with GitHub" pendingLabel="Opening GitHub…" /> : <Button type="submit" size="lg" className="w-full sm:w-fit" disabled><Github aria-hidden="true" />Continue with GitHub</Button>}
              </form>
            )}
            <span className="flex h-10 items-center px-1 text-xs text-muted-foreground">GitHub App user authorization · no PAT required</span>
          </div>
          <div className="mt-12 grid max-w-xl gap-3 sm:grid-cols-3">
            <Mode icon={TerminalSquare} label="CLI" state="Available in agent repo" />
            <Mode icon={Github} label="GitHub Actions" state="Reusable integration" />
            <Mode icon={CircleDashed} label="Hosted GitHub App" state="Webhook + isolated worker" pending={!configuration.githubApp || !hostedExecution.configured} />
          </div>
          <p className="mt-6 max-w-xl text-xs leading-5 text-muted-foreground">TerraFix never runs Terraform apply, auto-commits, force-pushes, merges, or claims a suggestion is safe to merge. An eligible verified source patch requires explicit approval and fresh verification; developer intent still requires human review.</p>
        </section>

        <section aria-label="Example diagnosis pipeline" className="relative">
          <div className="absolute -inset-10 -z-10 rounded-full bg-foreground/[0.035] blur-3xl" />
          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_20px_70px_rgba(15,23,42,0.10)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger/70" /><span className="size-2.5 rounded-full bg-warning/70" /><span className="size-2.5 rounded-full bg-success/70" /></div>
              <span className="font-mono text-[10px] text-muted-foreground">run-1842 · PR #284</span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-center">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">aws_ebs_volume.database</p>
                  <p className="mt-1 text-sm font-semibold">Semantic constraint violation</p>
                </div>
                <Badge variant="outline" className="border-warning/20 bg-warning-muted text-warning-foreground"><Check aria-hidden="true" className="size-3" />Verified after retry</Badge>
              </div>
              <div className="space-y-3 py-5">
                <PipelineRow step="01" label="Collect bounded context" meta="3.2s" complete />
                <PipelineRow step="02" label="Diagnose root cause" meta="96% confidence" complete />
                <PipelineRow step="03" label="Generate candidate patch" meta="1 file" complete />
                <PipelineRow step="04" label="Verify in isolation" meta="6 / 6 passed" complete />
              </div>
              <div className="rounded-lg border bg-secondary/35 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Evidence summary</p>
                <p className="mt-2 text-sm leading-6">Throughput is only configurable for <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">gp3</code> volumes. Candidate changes <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">gp2 → gp3</code>.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col gap-2 border-t px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="inline-flex items-center gap-2"><TerraFixLogo size={20} />TerraFix · Hosted control plane</span>
        <span>Engine and hosted control plane remain separate by design.</span>
      </footer>
    </div>
  );
}

function Mode({ icon: Icon, label, state, pending = false }: { icon: typeof Github; label: string; state: string; pending?: boolean }) {
  return (
    <div className="rounded-lg border bg-card/65 p-3.5 backdrop-blur-sm">
      <div className="flex items-center justify-between"><Icon aria-hidden="true" className="size-4 text-muted-foreground" /><span className={cn("size-1.5 rounded-full", pending ? "bg-neutral-status" : "bg-success")} /></div>
      <p className="mt-4 text-xs font-semibold">{label}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{state}</p>
    </div>
  );
}

function PipelineRow({ step, label, meta, complete }: { step: string; label: string; meta: string; complete?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md px-1 py-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">{step}</span>
      <span className={cn("flex size-5 items-center justify-center rounded-full border", complete ? "border-success/25 bg-success-muted text-success-foreground" : "bg-secondary text-muted-foreground")}>{complete ? <Check aria-hidden="true" className="size-3" /> : <CircleDashed aria-hidden="true" className="size-3" />}</span>
      <span className="flex-1 text-xs font-medium">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>
    </div>
  );
}
