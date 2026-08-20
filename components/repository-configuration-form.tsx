"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { saveRepositoryConfigurationAction } from "@/app/actions/repository-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CONTEXT_MODE_OPTIONS,
  FAILURE_STAGE_OPTIONS,
  MODEL_OPTIONS,
  MODEL_PROVIDER_OPTIONS,
} from "@/lib/repository-config/constants";
import type {
  RepositoryConfigActionState,
  RepositoryConfigInput,
  RepositoryConfigStatus,
} from "@/lib/repository-config/types";
import { parseRepositoryConfigFormData } from "@/lib/validation/repository-config";

const INITIAL_STATE: RepositoryConfigActionState = { status: "idle" };

export function RepositoryConfigurationForm({
  repositoryId,
  initialConfig,
  initialStatus,
  awsConnected,
  disabled = false,
}: {
  repositoryId: string;
  initialConfig: RepositoryConfigInput;
  initialStatus: RepositoryConfigStatus;
  awsConnected: boolean;
  disabled?: boolean;
}) {
  const boundAction = saveRepositoryConfigurationAction.bind(null, repositoryId);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);
  const [editRevision, setEditRevision] = useState(0);
  const [submittedRevision, setSubmittedRevision] = useState(0);
  const [clientErrors, setClientErrors] = useState<RepositoryConfigActionState["fieldErrors"]>({});

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const result = parseRepositoryConfigFormData(new FormData(event.currentTarget));
    if (result.success) {
      setClientErrors({});
      setSubmittedRevision(editRevision);
      return;
    }
    event.preventDefault();
    const fieldErrors: RepositoryConfigActionState["fieldErrors"] = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string") continue;
      const field = key as keyof RepositoryConfigInput;
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    setClientErrors(fieldErrors);
  }

  const responseMatchesCurrentRevision = editRevision === submittedRevision;
  const dirty = editRevision > 0 && (state.status !== "success" || !responseMatchesCurrentRevision);
  const errors = Object.keys(clientErrors ?? {}).length
    ? clientErrors
    : responseMatchesCurrentRevision
      ? state.fieldErrors
      : undefined;
  const statusMessage = pending
    ? "Saving configuration…"
    : Object.keys(clientErrors ?? {}).length
      ? "Review the highlighted fields."
      : state.status === "error" && responseMatchesCurrentRevision
        ? state.message
        : dirty
          ? "Unsaved changes"
          : state.message;

  return (
    <form
      action={formAction}
      onChange={() => setEditRevision((revision) => revision + 1)}
      onSubmit={validateBeforeSubmit}
      className="space-y-5"
      noValidate
    >
      <fieldset disabled={disabled || pending} className="contents">
        <div className="grid gap-5 xl:grid-cols-2">
          <ConfigCard title="Agent status" description="Control whether this repository can participate in future diagnosis runs.">
            <ToggleRow
              name="enabled"
              label="Enable Semantic Terraform Agent"
              description="Saving enables configuration only. No agent jobs run in Phase 3."
              defaultChecked={initialConfig.enabled}
            />
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <StatusRow label="Configuration" value={state.status === "success" ? "Saved" : formatOption(initialStatus)} />
              <StatusRow label="GitHub" value="Connected" />
              <StatusRow label="AWS" value={awsConnected ? "Connected" : "Not connected"} />
              <StatusRow label="Integration status" value={awsConnected && initialConfig.enabled ? "Ready" : "Configuration incomplete"} />
            </dl>
            {!awsConnected ? <p className="text-[11px] leading-5 text-warning-foreground">AWS connection is required before provider-authenticated verification can run.</p> : null}
          </ConfigCard>

          <ConfigCard title="Terraform configuration" description="Define the module root and Terraform runtime expected by this repository.">
            <Field label="Terraform directory" name="terraformDir" hint="Relative to the repository root, for example infra/production.">
              <Input name="terraformDir" defaultValue={initialConfig.terraformDir} className="font-mono" aria-invalid={Boolean(errors?.terraformDir)} aria-describedby="terraformDir-hint terraformDir-error" />
            </Field>
            <FieldError id="terraformDir-error" errors={errors?.terraformDir} />
            <Field label="Terraform version" name="terraformVersion" hint="Use a full semantic version (x.y.z).">
              <Input name="terraformVersion" defaultValue={initialConfig.terraformVersion} className="font-mono" inputMode="numeric" aria-invalid={Boolean(errors?.terraformVersion)} aria-describedby="terraformVersion-hint terraformVersion-error" />
            </Field>
            <FieldError id="terraformVersion-error" errors={errors?.terraformVersion} />
          </ConfigCard>

          <ConfigCard title="Agent configuration" description="Choose bounded context and repair behavior for the existing Python engine.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model provider" name="modelProvider">
                <Select name="modelProvider" defaultValue={initialConfig.modelProvider}>
                  {MODEL_PROVIDER_OPTIONS.map((provider) => <option key={provider} value={provider}>Gemini</option>)}
                </Select>
              </Field>
              <Field label="Model" name="model">
                <Select name="model" defaultValue={initialConfig.model}>
                  {MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Context mode" name="contextMode">
                <Select name="contextMode" defaultValue={initialConfig.contextMode}>
                  {CONTEXT_MODE_OPTIONS.map((mode) => <option key={mode} value={mode}>{formatOption(mode)}</option>)}
                </Select>
                <div className="space-y-1 text-[11px] leading-4 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Auto:</span> Lightweight context first, adding provider schema evidence when needed.</p>
                  <p><span className="font-medium text-foreground">Lightweight:</span> Terraform error, source, and diff.</p>
                  <p><span className="font-medium text-foreground">Schema-aware:</span> Adds the relevant provider resource schema.</p>
                </div>
              </Field>
              <Field label="Max repair attempts" name="maxRepairAttempts" hint="If verification returns useful Terraform feedback, the model may produce one revised patch.">
                <Select name="maxRepairAttempts" defaultValue={String(initialConfig.maxRepairAttempts)}>
                  <option value="0">0 — diagnosis only</option>
                  <option value="1">1 — one bounded repair</option>
                </Select>
              </Field>
            </div>
          </ConfigCard>

          <ConfigCard title="Trigger behavior" description="Describe the future events and failed Terraform stages this repository accepts.">
            <div className="space-y-3">
              <ToggleRow name="triggerOnPullRequest" label="Pull requests" description="Prepare configuration for future pull-request checks." defaultChecked={initialConfig.triggerOnPullRequest} />
              <ToggleRow name="triggerOnPush" label="Pushes" description="Prepare configuration for future branch-push checks." defaultChecked={initialConfig.triggerOnPush} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Failed Terraform stages</legend>
              <p className="text-[11px] text-muted-foreground">Select which CI failures will be eligible for diagnosis in a later execution phase.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FAILURE_STAGE_OPTIONS.map((stage) => (
                  <label key={stage} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-colors hover:bg-secondary/40">
                    <input type="checkbox" name="failedStages" value={stage} defaultChecked={initialConfig.failedStages.includes(stage)} className="size-4 rounded border-input accent-foreground" />
                    Terraform {stage}
                  </label>
                ))}
              </div>
              <FieldError id="failedStages-error" errors={errors?.failedStages} />
            </fieldset>
          </ConfigCard>
        </div>
      </fieldset>

      <div className="sticky bottom-3 z-10 flex flex-col justify-between gap-3 rounded-xl border bg-card/95 p-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center">
        <div aria-live="polite" className="flex min-h-5 items-center gap-2 text-xs">
          {pending ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {!pending && state.status === "success" && !dirty ? <Check aria-hidden="true" className="size-3.5 text-success-foreground" /> : null}
          {!pending && state.status === "error" && responseMatchesCurrentRevision ? <CircleAlert aria-hidden="true" className="size-3.5 text-destructive" /> : null}
          <span className={state.status === "error" && responseMatchesCurrentRevision ? "text-destructive" : "text-muted-foreground"}>{disabled ? "Restore GitHub access to edit this configuration." : statusMessage ?? "Changes persist to this repository after saving."}</span>
        </div>
        <Button type="submit" disabled={disabled || pending || !dirty} className="sm:min-w-36">
          {pending ? "Saving…" : "Save configuration"}
        </Button>
      </div>
    </form>
  );
}

function ConfigCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-4 pt-5">{children}</CardContent>
    </Card>
  );
}

function Field({ label, name, hint, children }: { label: string; name: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint ? <p id={`${name}-hint`} className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return <p id={id} role="alert" className="text-xs text-destructive">{errors[0]}</p>;
}

function ToggleRow({ name, label, description, defaultChecked }: { name: string; label: string; description: string; defaultChecked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
      <div><Label htmlFor={name}>{label}</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      <Switch id={name} name={name} label={label} defaultChecked={defaultChecked} />
    </div>
  );
}

function formatOption(value: string) {
  return value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-secondary/40 px-3 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>;
}
