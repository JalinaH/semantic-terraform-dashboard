"use client";

import { useActionState } from "react";
import { CloudCog, LoaderCircle, ShieldCheck, Unplug } from "lucide-react";
import {
  disconnectAwsConnectionAction,
  saveAwsRoleAction,
  startAwsOnboardingAction,
  verifyAwsConnectionAction,
} from "@/app/actions/aws";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { AWS_REGIONS } from "@/lib/aws/regions";
import type { AwsActionState } from "@/lib/aws/types";

const INITIAL_STATE: AwsActionState = { status: "idle" };

export function AwsRegionForm({ repositoryId, currentRegion, started, disabled = false }: { repositoryId: string; currentRegion: string; started: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState(startAwsOnboardingAction.bind(null, repositoryId), INITIAL_STATE);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="aws-region">Default verification region</Label>
        <Select id="aws-region" name="region" defaultValue={currentRegion} disabled={disabled || pending} aria-describedby="aws-region-help aws-region-error">
          {AWS_REGIONS.map((region) => <option key={region.value} value={region.value}>{region.value} — {region.label}</option>)}
        </Select>
        <p id="aws-region-help" className="text-[11px] leading-4 text-muted-foreground">Used as the default AWS provider region for isolated hosted Terraform verification.</p>
        <FieldErrors id="aws-region-error" errors={state.fieldErrors?.region} />
      </div>
      <Button type="submit" disabled={pending || disabled}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <CloudCog aria-hidden="true" />}{pending ? "Saving region…" : started ? "Save region" : "Start AWS setup"}</Button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function AwsRoleForm({ repositoryId, currentRoleArn, disabled = false }: { repositoryId: string; currentRoleArn: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(saveAwsRoleAction.bind(null, repositoryId), INITIAL_STATE);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="aws-role-arn">IAM role ARN</Label>
        <Input id="aws-role-arn" name="roleArn" defaultValue={currentRoleArn} disabled={disabled || pending} placeholder="arn:aws:iam::123456789012:role/SemanticTerraformAgentVerificationRole" className="font-mono text-xs" aria-describedby="aws-role-help aws-role-error" />
        <p id="aws-role-help" className="text-[11px] leading-4 text-muted-foreground">Only IAM role ARNs are accepted. User, policy, and STS assumed-role ARNs are rejected.</p>
        <FieldErrors id="aws-role-error" errors={state.fieldErrors?.roleArn} />
      </div>
      <Button type="submit" variant="outline" disabled={pending || disabled}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{pending ? "Saving role…" : "Save role ARN"}</Button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function AwsVerifyForm({ repositoryId, connected, disabled }: { repositoryId: string; connected: boolean; disabled: boolean }) {
  const [state, action, pending] = useActionState(verifyAwsConnectionAction.bind(null, repositoryId), INITIAL_STATE);
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" disabled={pending || disabled}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}{pending ? "Verifying with AWS…" : connected ? "Re-verify connection" : "Verify connection"}</Button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function AwsDisconnectForm({ repositoryId, disabled = false }: { repositoryId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(disconnectAwsConnectionAction.bind(null, repositoryId), INITIAL_STATE);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
        <input type="checkbox" name="confirmation" value="disconnect" required disabled={disabled || pending} className="mt-0.5 size-4 rounded border-input accent-destructive" />
        <span>I understand this removes the dashboard connection only. The IAM role must be deleted separately in AWS if it is no longer needed.</span>
      </label>
      <FieldErrors id="disconnect-error" errors={state.fieldErrors?.confirmation} />
      <Button type="submit" variant="destructive" disabled={pending || disabled}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Unplug aria-hidden="true" />}{pending ? "Disconnecting…" : "Disconnect AWS"}</Button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ActionFeedback({ state }: { state: AwsActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={state.status === "error" ? "text-xs leading-5 text-destructive" : "text-xs leading-5 text-success-foreground"}>{state.message}</p>;
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return <p id={id} role="alert" className="text-xs text-destructive">{errors[0]}</p>;
}
