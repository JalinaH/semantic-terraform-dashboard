import { AlertTriangle, ArrowUpRight, BrainCircuit, Check, CircleDollarSign, DatabaseZap, Gauge, Info, Minus, Route, Sparkles, X, Zap } from "lucide-react";
import { ModelTierBadge } from "@/components/model-tier-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatExactTokens, formatLatency, formatPercent, formatUsd } from "@/lib/analytics/format";
import { authoritativeReductionRatio, buildRunTimeline, type TimelineEventState } from "@/lib/runs/presentation";
import type { LlmCallView, RunDetail } from "@/lib/runs/types";
import { planFailureClassLabel, verificationOutcomeLabel } from "@/lib/verification-assessment";
import { cn } from "@/lib/utils";

export function RunObservability({ run }: { run: RunDetail }) {
  const hasV1 = run.llmCallCount !== null || run.agentVersion !== null || run.initialContextLevel !== null || run.failureMemoryStatus !== null;
  return (
    <div className="space-y-7">
      {run.resolutionSource === "verified_failure_memory" && run.llmCallCount === 0 ? <ZeroLlmCallout run={run} /> : null}
      {run.verificationOutcome ? <VerificationAssessment run={run} /> : null}
      <section aria-labelledby="ai-usage-heading">
        <SectionHeading id="ai-usage-heading" icon={BrainCircuit} title="AI Usage" description="Provider-reported model usage aggregated across this TerraFix diagnosis." />
        <Card className="overflow-hidden">
          <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 xl:grid-cols-4">
            <UsageMetric label="Model" value={displayModel(run)} hint={requestedActualHint(run)} />
            <UsageMetric label="Provider" value={displayLabel(run.llmProvider)} />
            <UsageMetric label="Route" value={run.finalModelTier ? <ModelTierBadge tier={run.finalModelTier} /> : displayLabel(run.routingMode)} />
            <UsageMetric label="Model calls" value={count(run.llmCallCount)} />
            <UsageMetric label="Input tokens" value={formatExactTokens(run.inputTokens)} />
            <UsageMetric label="Cached input" value={formatExactTokens(run.cachedInputTokens)} />
            <UsageMetric label="Output tokens" value={formatExactTokens(run.outputTokens)} />
            <UsageMetric label="Reasoning tokens" value={formatExactTokens(run.reasoningTokens)} />
            <UsageMetric label="Total tokens" value={formatExactTokens(run.totalTokens)} />
            <UsageMetric label="LLM cost" value={run.llmCostUsd === null ? "Not reported" : formatUsd(run.llmCostUsd, { freeLabel: run.costComplete === true && Number(run.llmCostUsd) === 0 })} hint={run.costComplete === false ? "Incomplete provider reporting" : "Reported by the configured model gateway when available."} />
            <UsageMetric label="LLM latency" value={formatLatency(run.llmLatencyMs)} />
            <UsageMetric label="Agent version" value={run.agentVersion ?? (hasV1 ? "Not reported" : "Legacy run")} />
          </CardContent>
        </Card>
        {run.llmCalls.length ? <CallBreakdown calls={run.llmCalls} costComplete={run.costComplete} /> : null}
      </section>

      <section aria-labelledby="context-optimization-heading">
        <SectionHeading id="context-optimization-heading" icon={Gauge} title="Context Optimization" description="Source blocks, changed lines, diagnostics, and provider schema are separate prompt sections. All measurements below are characters, not tokens." />
        <div className="grid gap-4 lg:grid-cols-2">
          <OptimizationCard title="Terraform source blocks" available={run.sourceCharactersAvailable} selected={run.sourceCharactersSelected} tooltip="Standalone Terraform resource and supporting-definition blocks retained by deterministic context selection. Diagnostic and Git diff evidence are counted separately." zeroNote={run.promptContext?.gitDiffIncluded === true ? "No standalone Terraform source block was included. The relevant Terraform diff was included separately." : "No standalone Terraform source block was included. Relevant changed lines may still have been included separately."} />
          <OptimizationCard title="Provider schema" available={run.schemaCharactersAvailable} selected={run.schemaCharactersSelected} tooltip="Only provider-schema paths relevant to the diagnosed resource and constraint are retained." />
        </div>
        {run.promptContext ? <PromptContextCard telemetry={run.promptContext} /> : null}
        {run.schemaAvoided === true ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-success/25 bg-success-muted p-4"><Check aria-hidden="true" className="mt-0.5 size-4 text-success-foreground" /><div><p className="text-sm font-semibold text-success-foreground">Provider schema avoided</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The first minimal-context diagnosis verified successfully, so TerraFix did not retrieve or send provider schema. No token savings are claimed unless measured.</p></div></div> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ProgressiveContext run={run} />
        <ModelRouting run={run} />
      </div>
      <FailureMemory run={run} />
      <RunTimeline run={run} />
    </div>
  );
}

function VerificationAssessment({ run }: { run: RunDetail }) {
  const tone = run.verificationOutcome === "fully_verified" ? "border-success/25 bg-success-muted text-success-foreground" : run.verificationOutcome === "environment_blocked" || run.verificationOutcome === "unknown_failure" ? "border-warning/25 bg-warning-muted text-warning-foreground" : "border-danger/25 bg-danger-muted text-danger-foreground";
  const stages = [
    ["Patch check", run.assessmentPatchCheckPassed, null], ["Patch apply", run.assessmentPatchApplyPassed, null], ["Terraform fmt", run.assessmentFmtPassed, null],
    ["Terraform init", run.assessmentInitPassed, null], ["Terraform validate", run.assessmentValidatePassed, null], ["Terraform plan", run.assessmentPlanPassed, run.assessmentPlanAttempted],
  ] as const;
  const explanation = run.verificationOutcome === "fully_verified"
    ? "Full Terraform plan verification completed successfully."
    : run.verificationOutcome === "environment_blocked"
      ? "The candidate passed local Terraform validation, but full plan verification was blocked by the execution environment."
      : run.verificationOutcome === "semantic_failure"
        ? "Terraform plan found a remaining Terraform configuration problem."
        : run.verificationOutcome === "unknown_failure"
          ? "Terraform plan failed, but TerraFix could not safely determine whether the cause was external or related to the configuration."
          : "The candidate did not pass patch safety verification.";
  return <section aria-labelledby="verification-assessment-heading"><SectionHeading id="verification-assessment-heading" icon={run.verificationOutcome === "fully_verified" ? Check : AlertTriangle} title="Verification outcome" description="Agent v1.1.4 deterministic assessment; the original diagnosis remains separate." /><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{verificationOutcomeLabel(run.verificationOutcome)}</CardTitle><CardDescription className="mt-1">{explanation}</CardDescription></div><Badge variant="outline" className={tone}>{verificationOutcomeLabel(run.verificationOutcome)}</Badge></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{stages.map(([label, passed, attempted]) => { const state = attempted === false ? "Not run" : passed === true ? "Passed" : passed === false ? "Failed" : "Not reported"; return <div key={label} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"><span>{label}</span><span className={state === "Passed" ? "text-success-foreground" : state === "Failed" ? "text-danger-foreground" : "text-muted-foreground"}>{state}</span></div>; })}</div>{run.planFailure ? <div className="rounded-lg border bg-secondary/20 p-4"><p className="text-xs font-semibold">Plan failure</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Definition label="Classification" value={planFailureClassLabel(run.planFailure.classification)} /><Definition label="Reason" value={run.planFailure.summary} />{run.planFailure.sourceFile ? <Definition label="Source" value={`${run.planFailure.sourceFile}${run.planFailure.sourceLine ? `:${run.planFailure.sourceLine}` : ""}`} /> : null}{run.planFailure.resourceAddress ? <Definition label="Resource" value={run.planFailure.resourceAddress} /> : null}<Definition label="Diagnostic source" value={run.planFailure.diagnosticFormat === "terraform_json" ? "Terraform JSON diagnostic" : "Bounded Terraform text"} /><div className="sm:col-span-2"><Definition label="Detail" value={run.planFailure.detail} /></div></dl></div> : null}</CardContent></Card></section>;
}

function CallBreakdown({ calls, costComplete }: { calls: LlmCallView[]; costComplete: boolean | null }) {
  return <details className="mt-3 rounded-xl border bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Per-call breakdown <span className="ml-2 font-normal text-muted-foreground">{calls.length} call{calls.length === 1 ? "" : "s"}</span></summary><div className="grid gap-3 border-t p-4 lg:grid-cols-2">{calls.map((call) => <div key={`${call.callNumber}-${call.type}`} className="rounded-lg border bg-secondary/25 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Call {call.callNumber}</p><p className="mt-1 text-xs text-muted-foreground">{displayLabel(call.type)} · Context: {displayLabel(call.contextLevel)}</p></div><ModelTierBadge tier={call.routingTier} /></div><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><CallMetric label="Model" value={call.reportedModel ?? call.requestedModel} /><CallMetric label="Provider" value={displayLabel(call.provider)} /><CallMetric label="Input" value={formatExactTokens(call.inputTokens)} /><CallMetric label="Cached input" value={formatExactTokens(call.cachedInputTokens)} /><CallMetric label="Output" value={formatExactTokens(call.outputTokens)} /><CallMetric label="Total" value={formatExactTokens(call.totalTokens)} /><CallMetric label="Cost" value={call.costUsd === null ? "Not reported" : formatUsd(call.costUsd, { freeLabel: costComplete === true && call.costUsd === 0 })} /><CallMetric label="Latency" value={formatLatency(call.latencyMs)} /></dl></div>)}</div></details>;
}

function OptimizationCard({ title, available, selected, tooltip, zeroNote }: { title: string; available: number | null; selected: number | null; tooltip: string; zeroNote?: string }) {
  const reduction = authoritativeReductionRatio(available, selected);
  const retained = reduction === null ? null : 1 - reduction;
  return <Card><CardHeader><div className="flex items-center gap-2"><CardTitle>{title}</CardTitle><Info aria-hidden="true" className="size-3.5 text-muted-foreground" /><span className="sr-only">{tooltip}</span></div><CardDescription>{tooltip}</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-3 gap-3"><Definition label="Available" value={characters(available)} /><Definition label="Selected" value={characters(selected)} /><Definition label="Reduction" value={formatPercent(reduction)} /></dl><div className="mt-5"><div className="flex items-center justify-between text-xs"><span>{title} retained</span><span className="font-mono">{formatPercent(retained, 0)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${title}: ${retained === null ? "retention not available" : `${Math.round(retained * 100)} percent retained`}`}><div className="h-full rounded-full bg-foreground/70" style={{ width: `${retained === null ? 0 : retained * 100}%` }} /></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{reduction === null ? "Reduction not available" : selected === 0 && zeroNote ? zeroNote : `${Math.round(reduction * 100)}% of standalone ${title.toLowerCase()} removed before the model call.`}</p></div></CardContent></Card>;
}

function PromptContextCard({ telemetry }: { telemetry: NonNullable<RunDetail["promptContext"]> }) {
  const sectionLabels: Record<string, string> = { terraform_error: "Diagnostic", git_diff: "Terraform diff", terraform_source: "Terraform source blocks", supporting_context: "Supporting definitions", metadata: "Context metadata", provider_schema: "Provider schema", verification_evidence: "Verification evidence", escalation_evidence: "Escalation evidence" };
  const sections = Object.entries(telemetry.sections).filter(([name]) => sectionLabels[name]);
  return <Card className="mt-4"><CardHeader><CardTitle>Prompt context</CardTitle><CardDescription>Rendered prompt sections reported by the agent. These values do not change the standalone source-block reduction above.</CardDescription></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Definition label="Terraform diff included" value={yesNo(telemetry.gitDiffIncluded)} /><Definition label="Changed Terraform lines" value={count(telemetry.changedLineCount)} /><Definition label="Selected context" value={characters(telemetry.selectedContextCharacters)} /><Definition label="Rendered user prompt" value={characters(telemetry.renderedUserPromptCharacters)} />{sections.map(([name, value]) => <Definition key={name} label={sectionLabels[name]} value={characters(value)} />)}</dl></CardContent></Card>;
}

function ProgressiveContext({ run }: { run: RunDetail }) {
  const legacy = run.initialContextLevel === null && run.contextEscalated === null;
  return <section aria-labelledby="progressive-context-heading"><SectionHeading id="progressive-context-heading" icon={ArrowUpRight} title="Progressive Context" description="Context escalation is separate from model escalation." /><Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Definition label="Initial context" value={legacy ? "Legacy run" : displayLabel(run.initialContextLevel)} /><Definition label="Final context" value={displayLabel(run.finalContextLevel)} /><Definition label="Escalated" value={yesNo(run.contextEscalated)} /><Definition label="Schema retrieved" value={yesNo(run.schemaRetrieved)} />{run.contextEscalationReason ? <div className="sm:col-span-2"><Definition label="Reason" value={displayLabel(run.contextEscalationReason)} /></div> : null}</CardContent></Card></section>;
}

function ModelRouting({ run }: { run: RunDetail }) {
  const routing = run.routingMode ?? run.configuredModelRouting;
  const maximumTier = run.maxModelTier ?? run.configuredMaxModelTier;
  const legacy = routing === null && run.initialModel === null;
  return <section aria-labelledby="model-routing-heading"><SectionHeading id="model-routing-heading" icon={Route} title="Model Routing" description="Tier represents TerraFix’s configured cost and access policy. Configuration values were snapshotted when the run was queued." /><Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Definition label="Routing mode" value={legacy ? "Legacy run" : displayLabel(routing)} /><Definition label="Max tier" value={maximumTier ? <ModelTierBadge tier={maximumTier} /> : "Not reported"} />{run.configuredModelId ? <Definition label="Configured model" value={run.configuredModelId} /> : null}{run.accountAccessLevel ? <Definition label="Access snapshot" value={run.accountAccessLevel} /> : null}<Definition label="Initial model" value={run.initialModel ?? run.requestedModel ?? "Not reported"} /><Definition label="Initial tier" value={run.initialModelTier ? <ModelTierBadge tier={run.initialModelTier} /> : "Not reported"} /><Definition label="Final model" value={run.finalModel ?? run.reportedModel ?? "Not reported"} /><Definition label="Final tier" value={run.finalModelTier ? <ModelTierBadge tier={run.finalModelTier} /> : "Not reported"} /><Definition label="Model escalated" value={yesNo(run.modelEscalated)} />{run.modelPolicyVersion ? <Definition label="Policy version" value={run.modelPolicyVersion} /> : null}{run.modelEscalated && run.initialModelTier && run.finalModelTier ? <Definition label="Tier path" value={`${run.initialModelTier.toUpperCase()} → ${run.finalModelTier.toUpperCase()}`} /> : null}</CardContent></Card></section>;
}

function FailureMemory({ run }: { run: RunDetail }) {
  const historicalAvailable = run.llmCallsAvoided !== null || run.historicalTokensAvoided !== null || run.historicalCostAvoidedUsd !== null;
  return <section aria-labelledby="failure-memory-heading"><SectionHeading id="failure-memory-heading" icon={DatabaseZap} title="Verified Failure Memory" description="A previously verified candidate may be reused, but it is always verified again against the current repository state." /><Card><CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_1fr]"><div className="grid gap-4 sm:grid-cols-2"><Definition label="Verified failure memory" value={run.failureMemoryReused === true ? "Reused" : run.failureMemoryStatus ? displayLabel(run.failureMemoryStatus) : "Not reported"} /><Definition label="Fresh Terraform verify" value={run.freshVerificationPassed === null ? "Not reported" : run.freshVerificationPassed ? "Passed" : "Did not pass"} /><Definition label="Resolution source" value={run.resolutionSource === "verified_failure_memory" ? "Verified memory" : run.resolutionSource === "llm" ? "LLM" : "Not reported"} /><Definition label="LLM calls" value={count(run.llmCallCount)} /></div><div className="rounded-lg border bg-secondary/25 p-4"><p className="text-xs font-semibold">Historical comparison</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Authoritative telemetry from the previously verified run. It is not a guarantee of future savings.</p><dl className="mt-4 grid gap-3 sm:grid-cols-3"><Definition label="LLM calls avoided" value={historicalAvailable ? count(run.llmCallsAvoided) : "Not available"} /><Definition label="Historical tokens avoided" value={historicalAvailable ? formatExactTokens(run.historicalTokensAvoided) : "Not available"} /><Definition label="Historical cost avoided" value={historicalAvailable ? run.historicalCostAvoidedUsd === null ? "Not available" : formatUsd(run.historicalCostAvoidedUsd) : "Not available"} /></dl></div></CardContent></Card></section>;
}

function ZeroLlmCallout({ run }: { run: RunDetail }) {
  return <div role="status" className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-muted p-4"><Zap aria-hidden="true" className="mt-0.5 size-5 text-success-foreground" /><div><p className="text-sm font-semibold text-success-foreground">0 LLM calls required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">TerraFix reused a previously verified failure pattern and re-verified the candidate patch against the current repository state{run.freshVerificationPassed === true ? ". Fresh verification passed." : "."}</p></div></div>;
}

function RunTimeline({ run }: { run: RunDetail }) {
  const events = buildRunTimeline(run);
  return <section aria-labelledby="run-timeline-heading"><SectionHeading id="run-timeline-heading" icon={Sparkles} title="Run timeline" description="Each icon describes that operation’s outcome; publication remains independent from Terraform verification." /><Card><CardContent className="pt-5"><ol className="space-y-0">{events.map((event, index) => { const presentation = timelinePresentation(event.state); const Icon = presentation.icon; return <li key={`${event.label}-${index}`} data-state={event.state} className="relative flex gap-3 pb-5 last:pb-0"><span className={cn("relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", presentation.className)}><Icon aria-hidden="true" className="size-3" /><span className="sr-only">{presentation.label}</span></span>{index < events.length - 1 ? <span aria-hidden="true" className="absolute left-2.5 top-5 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}<div><p className="text-xs font-medium">{event.label}</p>{event.detail ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{event.detail}</p> : null}</div></li>; })}</ol></CardContent></Card></section>;
}

function timelinePresentation(state: TimelineEventState) {
  if (state === "success" || state === "published") return { icon: Check, label: state === "published" ? "Published" : "Succeeded", className: "border-success/25 bg-success-muted text-success-foreground" };
  if (state === "failure" || state === "rejected") return { icon: X, label: state === "rejected" ? "Rejected" : "Failed", className: "border-danger/25 bg-danger-muted text-danger-foreground" };
  if (state === "warning") return { icon: AlertTriangle, label: "Unavailable", className: "border-warning/25 bg-warning-muted text-warning-foreground" };
  return { icon: Minus, label: state === "skipped" ? "Skipped" : "Informational", className: "border-border bg-neutral-status-muted text-neutral-status" };
}

function SectionHeading({ id, icon: Icon, title, description }: { id: string; icon: typeof CircleDollarSign; title: string; description: string }) { return <div className="mb-3 flex items-start gap-2.5"><span className="mt-0.5 flex size-7 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" /></span><div><h2 id={id} className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div></div>; }
function UsageMetric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string | null }) { return <div className="min-w-0 bg-card p-4"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><div className="mt-1.5 truncate font-mono text-xs font-medium">{value}</div>{hint ? <p className="mt-1 truncate text-[10px] text-muted-foreground" title={hint}>{hint}</p> : null}</div>; }
function CallMetric({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate font-mono">{value}</dd></div>; }
function Definition({ label, value }: { label: string; value: React.ReactNode }) { return <div className="min-w-0"><dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-mono text-xs font-medium">{value}</dd></div>; }
function displayModel(run: RunDetail) { return run.reportedModel ?? run.requestedModel ?? run.model ?? "Not reported"; }
function requestedActualHint(run: RunDetail) { return run.requestedModel && run.reportedModel && run.requestedModel !== run.reportedModel ? `Requested ${run.requestedModel}` : null; }
function displayLabel(value: string | null) { return value ? value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Not reported"; }
function yesNo(value: boolean | null) { return value === null ? "Not reported" : value ? "Yes" : "No"; }
function count(value: number | null) { return value === null ? "Not reported" : value.toLocaleString("en-US"); }
function characters(value: number | null) { return value === null ? "Not available" : `${value.toLocaleString("en-US")} chars`; }
