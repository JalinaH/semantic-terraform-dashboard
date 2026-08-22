import { ArrowUpRight, BrainCircuit, Check, CircleDollarSign, DatabaseZap, Gauge, Info, Route, Sparkles, Zap } from "lucide-react";
import { ModelTierBadge } from "@/components/model-tier-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatExactTokens, formatLatency, formatPercent, formatUsd } from "@/lib/analytics/format";
import type { LlmCallView, RunDetail } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

export function RunObservability({ run }: { run: RunDetail }) {
  const hasV1 = run.llmCallCount !== null || run.agentVersion !== null || run.initialContextLevel !== null || run.failureMemoryStatus !== null;
  return (
    <div className="space-y-7">
      {run.resolutionSource === "verified_failure_memory" && run.llmCallCount === 0 ? <ZeroLlmCallout run={run} /> : null}
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
        <SectionHeading id="context-optimization-heading" icon={Gauge} title="Context Optimization" description="Character counts after TerraFix deterministically removes unrelated Terraform context. Character reduction is not token reduction." />
        <div className="grid gap-4 lg:grid-cols-2">
          <OptimizationCard title="Terraform source" available={run.sourceCharactersAvailable} selected={run.sourceCharactersSelected} reduction={run.sourceReductionRatio} tooltip="TerraFix deterministically removes unrelated Terraform context before sending data to the model." />
          <OptimizationCard title="Provider schema" available={run.schemaCharactersAvailable} selected={run.schemaCharactersSelected} reduction={run.schemaReductionRatio} tooltip="Only the provider-schema paths relevant to the diagnosed resource and constraint are retained." />
        </div>
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

function CallBreakdown({ calls, costComplete }: { calls: LlmCallView[]; costComplete: boolean | null }) {
  return <details className="mt-3 rounded-xl border bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Per-call breakdown <span className="ml-2 font-normal text-muted-foreground">{calls.length} call{calls.length === 1 ? "" : "s"}</span></summary><div className="grid gap-3 border-t p-4 lg:grid-cols-2">{calls.map((call) => <div key={`${call.callNumber}-${call.type}`} className="rounded-lg border bg-secondary/25 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Call {call.callNumber}</p><p className="mt-1 text-xs text-muted-foreground">{displayLabel(call.type)} · Context: {displayLabel(call.contextLevel)}</p></div><ModelTierBadge tier={call.routingTier} /></div><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><CallMetric label="Model" value={call.reportedModel ?? call.requestedModel} /><CallMetric label="Provider" value={displayLabel(call.provider)} /><CallMetric label="Input" value={formatExactTokens(call.inputTokens)} /><CallMetric label="Cached input" value={formatExactTokens(call.cachedInputTokens)} /><CallMetric label="Output" value={formatExactTokens(call.outputTokens)} /><CallMetric label="Total" value={formatExactTokens(call.totalTokens)} /><CallMetric label="Cost" value={call.costUsd === null ? "Not reported" : formatUsd(call.costUsd, { freeLabel: costComplete === true && call.costUsd === 0 })} /><CallMetric label="Latency" value={formatLatency(call.latencyMs)} /></dl></div>)}</div></details>;
}

function OptimizationCard({ title, available, selected, reduction, tooltip }: { title: string; available: number | null; selected: number | null; reduction: number | null; tooltip: string }) {
  const retained = available !== null && selected !== null && available > 0 ? Math.min(selected / available, 1) : reduction !== null ? 1 - reduction : null;
  return <Card><CardHeader><div className="flex items-center gap-2"><CardTitle>{title}</CardTitle><Info aria-hidden="true" className="size-3.5 text-muted-foreground" /><span className="sr-only">{tooltip}</span></div><CardDescription>{tooltip}</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-3 gap-3"><Definition label="Available" value={characters(available)} /><Definition label="Selected" value={characters(selected)} /><Definition label="Reduction" value={formatPercent(reduction)} /></dl><div className="mt-5"><div className="flex items-center justify-between text-xs"><span>{title} retained</span><span className="font-mono">{formatPercent(retained, 0)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${title}: ${retained === null ? "retention not available" : `${Math.round(retained * 100)} percent retained`}`}><div className="h-full rounded-full bg-foreground/70" style={{ width: `${retained === null ? 0 : retained * 100}%` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">{reduction === null ? "Reduction not available" : `${Math.round(reduction * 100)}% removed before the model call`}</p></div></CardContent></Card>;
}

function ProgressiveContext({ run }: { run: RunDetail }) {
  const legacy = run.initialContextLevel === null && run.contextEscalated === null;
  return <section aria-labelledby="progressive-context-heading"><SectionHeading id="progressive-context-heading" icon={ArrowUpRight} title="Progressive Context" description="Context escalation is separate from model escalation." /><Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Definition label="Initial context" value={legacy ? "Legacy run" : displayLabel(run.initialContextLevel)} /><Definition label="Final context" value={displayLabel(run.finalContextLevel)} /><Definition label="Escalated" value={yesNo(run.contextEscalated)} /><Definition label="Schema retrieved" value={yesNo(run.schemaRetrieved)} />{run.contextEscalationReason ? <div className="sm:col-span-2"><Definition label="Reason" value={displayLabel(run.contextEscalationReason)} /></div> : null}</CardContent></Card></section>;
}

function ModelRouting({ run }: { run: RunDetail }) {
  const legacy = run.routingMode === null && run.initialModel === null;
  return <section aria-labelledby="model-routing-heading"><SectionHeading id="model-routing-heading" icon={Route} title="Model Routing" description="Tier represents TerraFix’s configured cost and access policy." /><Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Definition label="Routing mode" value={legacy ? "Legacy run" : displayLabel(run.routingMode)} /><Definition label="Max tier" value={run.maxModelTier ? <ModelTierBadge tier={run.maxModelTier} /> : "Not reported"} /><Definition label="Initial model" value={run.initialModel ?? run.requestedModel ?? "Not reported"} /><Definition label="Initial tier" value={run.initialModelTier ? <ModelTierBadge tier={run.initialModelTier} /> : "Not reported"} /><Definition label="Final model" value={run.finalModel ?? run.reportedModel ?? "Not reported"} /><Definition label="Final tier" value={run.finalModelTier ? <ModelTierBadge tier={run.finalModelTier} /> : "Not reported"} /><Definition label="Model escalated" value={yesNo(run.modelEscalated)} />{run.modelEscalated && run.initialModelTier && run.finalModelTier ? <Definition label="Tier path" value={`${run.initialModelTier.toUpperCase()} → ${run.finalModelTier.toUpperCase()}`} /> : null}</CardContent></Card></section>;
}

function FailureMemory({ run }: { run: RunDetail }) {
  const historicalAvailable = run.llmCallsAvoided !== null || run.historicalTokensAvoided !== null || run.historicalCostAvoidedUsd !== null;
  return <section aria-labelledby="failure-memory-heading"><SectionHeading id="failure-memory-heading" icon={DatabaseZap} title="Verified Failure Memory" description="A previously verified candidate may be reused, but it is always verified again against the current repository state." /><Card><CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_1fr]"><div className="grid gap-4 sm:grid-cols-2"><Definition label="Verified failure memory" value={run.failureMemoryReused === true ? "Reused" : run.failureMemoryStatus ? displayLabel(run.failureMemoryStatus) : "Not reported"} /><Definition label="Fresh Terraform verify" value={run.freshVerificationPassed === null ? "Not reported" : run.freshVerificationPassed ? "Passed" : "Did not pass"} /><Definition label="Resolution source" value={run.resolutionSource === "verified_failure_memory" ? "Verified memory" : run.resolutionSource === "llm" ? "LLM" : "Not reported"} /><Definition label="LLM calls" value={count(run.llmCallCount)} /></div><div className="rounded-lg border bg-secondary/25 p-4"><p className="text-xs font-semibold">Historical comparison</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Authoritative telemetry from the previously verified run. It is not a guarantee of future savings.</p><dl className="mt-4 grid gap-3 sm:grid-cols-3"><Definition label="LLM calls avoided" value={historicalAvailable ? count(run.llmCallsAvoided) : "Not available"} /><Definition label="Historical tokens avoided" value={historicalAvailable ? formatExactTokens(run.historicalTokensAvoided) : "Not available"} /><Definition label="Historical cost avoided" value={historicalAvailable ? run.historicalCostAvoidedUsd === null ? "Not available" : formatUsd(run.historicalCostAvoidedUsd) : "Not available"} /></dl></div></CardContent></Card></section>;
}

function ZeroLlmCallout({ run }: { run: RunDetail }) {
  return <div role="status" className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-muted p-4"><Zap aria-hidden="true" className="mt-0.5 size-5 text-success-foreground" /><div><p className="text-sm font-semibold text-success-foreground">0 LLM calls required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">TerraFix reused a previously verified failure pattern and re-verified the candidate patch against the current repository state{run.freshVerificationPassed === true ? ". Fresh verification passed." : "."}</p></div></div>;
}

function RunTimeline({ run }: { run: RunDetail }) {
  const events = [
    { label: run.failureMemoryReused ? "Verified memory hit" : "Failure detected", detail: run.failureMemoryStatus ? `Memory: ${displayLabel(run.failureMemoryStatus)}` : null },
    { label: "Minimal context built", detail: run.sourceCharactersAvailable !== null && run.sourceCharactersSelected !== null ? `${run.sourceCharactersAvailable.toLocaleString()} → ${run.sourceCharactersSelected.toLocaleString()} source characters` : null },
    ...(run.llmCallCount === 0 ? [{ label: "0 LLM calls", detail: "Verified-memory resolution" }] : [{ label: "Model diagnosis", detail: [run.finalModelTier?.toUpperCase(), formatExactTokens(run.inputTokens) === "Not reported" ? null : `${formatExactTokens(run.inputTokens)} input tokens`].filter(Boolean).join(" · ") || null }]),
    ...(run.attempts.length > 1 && run.attempts[0].status !== "verified" ? [{ label: "First verification", detail: run.attempts[0].failedStage ? `Failed at ${displayLabel(run.attempts[0].failedStage)}` : displayLabel(run.attempts[0].status) }] : []),
    ...(run.contextEscalated ? [{ label: "Context escalated", detail: run.schemaRetrieved ? "Sliced provider schema added" : displayLabel(run.contextEscalationReason) }] : []),
    ...(run.modelEscalated ? [{ label: "Model escalated", detail: run.initialModelTier && run.finalModelTier ? `${run.initialModelTier.toUpperCase()} → ${run.finalModelTier.toUpperCase()}` : `${run.initialModel ?? "Initial model"} → ${run.finalModel ?? "final model"}` }] : []),
    { label: "Candidate patch", detail: run.candidateSource === "verified_failure_memory" ? "Reused verified candidate" : null },
    { label: "Terraform verification", detail: displayLabel(run.verificationStatus) },
    { label: "PR publication", detail: run.publication?.status ? displayLabel(run.publication.status) : run.pullRequestNumber ? "Not started" : "Not applicable" },
  ];
  return <section aria-labelledby="run-timeline-heading"><SectionHeading id="run-timeline-heading" icon={Sparkles} title="Run timeline" description="Diagnosis, optimization, verification, and publication events when telemetry is available." /><Card><CardContent className="pt-5"><ol className="space-y-0">{events.map((event, index) => <li key={`${event.label}-${index}`} className="relative flex gap-3 pb-5 last:pb-0"><span className={cn("relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", "border-success/25 bg-success-muted text-success-foreground")}><Check aria-hidden="true" className="size-3" /></span>{index < events.length - 1 ? <span aria-hidden="true" className="absolute left-2.5 top-5 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}<div><p className="text-xs font-medium">{event.label}</p>{event.detail ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{event.detail}</p> : null}</div></li>)}</ol></CardContent></Card></section>;
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
