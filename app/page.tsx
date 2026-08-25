import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Check,
  CircleDashed,
  CloudCog,
  Database,
  Github,
  GitPullRequestArrow,
  LockKeyhole,
  Radar,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
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

const capabilities = [
  {
    icon: Radar,
    title: "Failure-aware collection",
    description: "Signed workflow events are filtered before bounded logs, diffs, and Terraform context enter the diagnosis pipeline.",
  },
  {
    icon: BrainCircuit,
    title: "Policy-driven reasoning",
    description: "Per-repository model routing controls cost and context while immutable run snapshots keep every decision auditable.",
  },
  {
    icon: BadgeCheck,
    title: "Verification before action",
    description: "Candidate patches run through isolated Terraform checks. Only eligible evidence can reach a human-approved PR workflow.",
  },
];

const trustPoints = [
  "GitHub App authentication with short-lived installation tokens",
  "HMAC-verified webhooks with delivery-level idempotency",
  "Exact revision checkout in disposable worker workspaces",
  "Optional AWS AssumeRole sessions—no stored access keys",
  "Fresh verification before a single, non-force PR commit",
  "No Terraform apply, automatic merge, or branch bypass path",
];

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const session = await auth();
  const configuration = getIntegrationConfigurationStatus();
  const hostedExecution = getHostedExecutionConfigurationStatus();
  const { auth: authState } = await searchParams;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="code-grid pointer-events-none absolute inset-x-0 top-0 h-[860px] opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-340px] size-[760px] -translate-x-1/2 rounded-full bg-success/[0.06] blur-3xl" />

      <header className="relative z-20 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2">
            <TerraFixLogo size={32} priority />
            <span className="text-sm font-semibold tracking-tight">TerraFix</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-6 text-xs font-medium text-muted-foreground md:flex">
            <Link href="#capabilities" className="transition-colors hover:text-foreground">Capabilities</Link>
            <Link href="#architecture" className="transition-colors hover:text-foreground">Architecture</Link>
            <Link href="#security" className="transition-colors hover:text-foreground">Security</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-success/20 bg-success-muted text-success-foreground sm:inline-flex"><span className={cn("size-1.5 rounded-full", configuration.githubApp && hostedExecution.configured ? "bg-success" : "bg-neutral-status")} />{configuration.githubApp && hostedExecution.configured ? "Hosted pipeline ready" : "Production architecture"}</Badge>
            <ThemeToggle />
            {session?.user ? <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}>Dashboard</Link> : null}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-14 px-5 pb-16 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-20 lg:pb-24 lg:pt-32">
          <div>
            <Badge variant="outline" className="bg-card/75 text-muted-foreground"><Sparkles aria-hidden="true" className="size-3 text-success" />Terraform CI intelligence</Badge>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-[-0.05em] sm:text-5xl lg:text-[3.75rem]">Diagnose failures. <span className="text-muted-foreground">Verify the fix.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">TerraFix turns failed GitHub Actions Terraform runs into traceable diagnoses, isolated verification evidence, and human-approved pull request updates.</p>
            {authState === "required" ? <p className="mt-5 max-w-xl rounded-lg border border-warning/20 bg-warning-muted px-4 py-3 text-sm text-warning-foreground">Continue with GitHub to access the protected dashboard.</p> : null}
            {authState === "configuration" || !configuration.authentication ? <p className="mt-5 max-w-xl rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">GitHub sign-in is not configured.</span> Add the environment values from the README to enable authentication.</p> : null}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {session?.user ? (
                <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}>Open Dashboard <ArrowRight aria-hidden="true" /></Link>
              ) : (
                <form action={signInWithGitHubAction}>
                  <input type="hidden" name="returnTo" value="/dashboard" />
                  {configuration.authentication ? <ServerActionButton size="lg" className="w-full sm:w-fit" label="Continue with GitHub" pendingLabel="Opening GitHub…" /> : <Button type="submit" size="lg" className="w-full sm:w-fit" disabled><Github aria-hidden="true" />Continue with GitHub</Button>}
                </form>
              )}
              <Link href="#architecture" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-fit")}>Explore architecture</Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-3.5" />GitHub App authorization · no personal access token required</p>
          </div>

          <section aria-label="Example diagnosis pipeline" className="relative">
            <div className="absolute -inset-10 -z-10 rounded-full bg-foreground/[0.035] blur-3xl" />
            <div className="overflow-hidden rounded-xl border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
              <div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger/70" /><span className="size-2.5 rounded-full bg-warning/70" /><span className="size-2.5 rounded-full bg-success/70" /></div><span className="font-mono text-[10px] text-muted-foreground">run-1842 · PR #284</span></div>
              <div className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-center"><div><p className="font-mono text-xs text-muted-foreground">aws_ebs_volume.database</p><p className="mt-1 text-sm font-semibold">Semantic constraint violation</p></div><Badge variant="outline" className="border-success/20 bg-success-muted text-success-foreground"><Check aria-hidden="true" className="size-3" />Verified after retry</Badge></div>
                <div className="space-y-3 py-5"><PipelineRow step="01" label="Collect bounded context" meta="3.2s" complete /><PipelineRow step="02" label="Diagnose root cause" meta="96% confidence" complete /><PipelineRow step="03" label="Generate candidate patch" meta="1 file" complete /><PipelineRow step="04" label="Verify in isolation" meta="6 / 6 passed" complete /></div>
                <div className="rounded-lg border bg-secondary/35 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Evidence summary</p><p className="mt-2 text-sm leading-6">Throughput is only configurable for <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">gp3</code> volumes. Candidate changes <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">gp2 → gp3</code>.</p></div>
              </div>
            </div>
          </section>
        </section>

        <section aria-label="Product highlights" className="border-y bg-card/55">
          <div className="mx-auto grid max-w-7xl divide-y px-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-8 lg:grid-cols-4"><Highlight value="HMAC" label="signed webhook ingestion" /><Highlight value="4-stage" label="progressive verification" /><Highlight value="SHA-256" label="patch provenance binding" /><Highlight value="0" label="automatic infrastructure applies" /></div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionIntro eyebrow="Built for the full lifecycle" title="From CI signal to reviewable evidence" description="The dashboard coordinates authentication, repository policy, worker execution, publication, and analytics without moving Terraform reasoning into the web process." />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, description }, index) => <article key={title} className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-lg border bg-secondary/60"><Icon aria-hidden="true" className="size-5 text-muted-foreground" /></span><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span></div><h3 className="mt-8 text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></article>)}
          </div>
        </section>

        <section id="architecture" className="border-y bg-card/55">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
            <SectionIntro eyebrow="Decoupled by design" title="A production-shaped control plane" description="Stateless web requests and long-running Terraform jobs are separated by a durable PostgreSQL queue. Each boundary has one clear responsibility." />
            <div className="mt-10 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"><ArchitectureNode icon={Github} label="GitHub App" meta="OAuth · webhooks · PRs" /><FlowArrow /><ArchitectureNode icon={CloudCog} label="Next.js control plane" meta="Auth · policy · analytics" /><FlowArrow /><ArchitectureNode icon={Database} label="PostgreSQL" meta="Queue · audit · telemetry" /><FlowArrow /><ArchitectureNode icon={ServerCog} label="Isolated worker" meta="Agent · Git · Terraform" /></div>
            <div className="mt-4 rounded-xl border bg-background/70 p-4 text-xs leading-5 text-muted-foreground"><strong className="font-medium text-foreground">Execution boundary:</strong> the Vercel-compatible control plane never runs Git, Python, or Terraform. The persistent worker claims jobs atomically and executes each exact revision in a disposable workspace.</div>
          </div>
        </section>

        <section id="security" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div><Badge variant="outline" className="bg-card/70 text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3" />Trust boundaries</Badge><h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em]">Automation that stops at human intent.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">TerraFix automates evidence collection and verification—not ownership. Source mutation is narrowly scoped, explicitly approved, and independently revalidated.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{trustPoints.map((point) => <div key={point} className="flex gap-3 rounded-lg border bg-card p-4"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /><p className="text-sm leading-6">{point}</p></div>)}</div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Technology</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Next.js · TypeScript · PostgreSQL · Prisma · AWS · Terraform</h2></div><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Tech icon={Workflow} label="Durable jobs" /><Tech icon={GitPullRequestArrow} label="PR publication" /><Tech icon={TerminalSquare} label="Isolated verification" /></div></div>
        </section>
      </main>

      <footer className="relative z-10 border-t bg-card/35"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><span className="inline-flex items-center gap-2"><TerraFixLogo size={20} />TerraFix · Verified Terraform failure intelligence</span><span>Semantic Terraform Agent v1.2.0 · Human review required</span></div></footer>
    </div>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2><p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">{description}</p></div>;
}

function Highlight({ value, label }: { value: string; label: string }) {
  return <div className="py-6 sm:px-6 first:pl-0 last:pr-0"><p className="font-mono text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function ArchitectureNode({ icon: Icon, label, meta }: { icon: typeof Github; label: string; meta: string }) {
  return <div className="flex min-h-32 flex-col justify-between rounded-xl border bg-card p-5"><Icon aria-hidden="true" className="size-5 text-muted-foreground" /><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{meta}</p></div></div>;
}

function FlowArrow() {
  return <div className="hidden items-center justify-center text-muted-foreground lg:flex"><ArrowRight aria-hidden="true" className="size-4" /></div>;
}

function Tech({ icon: Icon, label }: { icon: typeof Workflow; label: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2"><Icon aria-hidden="true" className="size-3.5" />{label}</span>;
}

function PipelineRow({ step, label, meta, complete }: { step: string; label: string; meta: string; complete?: boolean }) {
  return <div className="flex items-center gap-3 rounded-md px-1 py-1.5"><span className="font-mono text-[10px] text-muted-foreground">{step}</span><span className={cn("flex size-5 items-center justify-center rounded-full border", complete ? "border-success/25 bg-success-muted text-success-foreground" : "bg-secondary text-muted-foreground")}>{complete ? <Check aria-hidden="true" className="size-3" /> : <CircleDashed aria-hidden="true" className="size-3" />}</span><span className="flex-1 text-xs font-medium">{label}</span><span className="font-mono text-[10px] text-muted-foreground">{meta}</span></div>;
}
