"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, LoaderCircle, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SafeAwsOnboardingSession } from "@/lib/aws/onboarding-session";
import { cn } from "@/lib/utils";

interface Props {
  repositoryId: string;
  region: string;
  connected: boolean;
  configured: boolean;
  disabled?: boolean;
  initialSession: SafeAwsOnboardingSession | null;
}

export function AwsGuidedOnboarding({
  repositoryId,
  region,
  connected,
  configured,
  disabled = false,
  initialSession,
}: Props) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshed = useRef(false);

  const active = session && ["pending", "stack_launched", "callback_received", "verifying"].includes(session.status);

  useEffect(() => {
    if (!active || !session) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/repositories/${repositoryId}/aws/onboarding/${session.id}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const body = await response.json() as { session?: SafeAwsOnboardingSession };
        if (!body.session) return;
        setSession(body.session);
        if (body.session.status === "connected" && !refreshed.current) {
          refreshed.current = true;
          router.refresh();
        }
      } catch {
        // A transient polling failure is expected to recover on the next tick.
      }
    };
    const timer = window.setInterval(poll, 2_500);
    void poll();
    return () => window.clearInterval(timer);
  }, [active, repositoryId, router, session]);

  useEffect(() => {
    if (session?.status === "connected" && !connected && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [connected, router, session?.status]);

  async function start() {
    if (connected && !window.confirm("Reconnect AWS? The current role stays connected until the new role is verified.")) return;
    setPending(true);
    setError(null);
    setLaunchUrl(null);
    refreshed.current = false;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/aws/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ region }),
      });
      const body = await response.json() as {
        launchUrl?: string;
        session?: SafeAwsOnboardingSession;
        error?: string;
      };
      if (!response.ok || !body.launchUrl || !body.session) {
        popup?.close();
        throw new Error(body.error === "guided_onboarding_not_configured"
          ? "Guided AWS setup requires a public HTTPS TerraFix URL."
          : "TerraFix could not prepare AWS setup. Try again or use manual setup.");
      }
      setSession(body.session);
      setLaunchUrl(body.launchUrl);
      if (popup) popup.location.href = body.launchUrl;
      else window.open(body.launchUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : "TerraFix could not prepare AWS setup.");
    } finally {
      setPending(false);
    }
  }

  if (connected && !active && session?.status !== "failed" && session?.status !== "expired") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success-muted/50 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-white"><Check aria-hidden="true" className="size-4" /></span>
          <div><p className="text-sm font-semibold">AWS Connected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">TerraFix verified the customer-controlled role with temporary STS credentials.</p></div>
        </div>
        <Button type="button" variant="outline" onClick={start} disabled={pending || disabled || !configured}>
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RotateCcw aria-hidden="true" />}
          {pending ? "Preparing…" : "Reconnect"}
        </Button>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </div>
    );
  }

  if (!session || session.status === "failed" || session.status === "expired") {
    const expired = session?.status === "expired";
    const failed = session?.status === "failed";
    return (
      <div className="space-y-5">
        {expired ? <ErrorMessage>AWS setup expired. Start again to create a fresh one-time connection.</ErrorMessage> : null}
        {failed ? <ErrorMessage>{session.failureMessage ?? "AWS setup could not be verified."}</ErrorMessage> : null}
        <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <SecurityItem>No AWS access keys stored</SecurityItem>
          <SecurityItem>Temporary STS credentials only</SecurityItem>
          <SecurityItem>Revocable from AWS</SecurityItem>
          <SecurityItem>Least-privilege role</SecurityItem>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={start} disabled={pending || disabled || !configured}>
            {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
            {pending ? "Preparing secure connection…" : expired || failed ? "Start again" : "Connect AWS"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Stack region: <span className="font-mono">{region}</span></span>
        </div>
        {!configured ? <ErrorMessage>Guided onboarding requires the AWS control plane and a public HTTPS application URL.</ErrorMessage> : null}
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </div>
    );
  }

  const callbackReceived = ["callback_received", "verifying", "connected"].includes(session.status);
  const verified = session.status === "connected";
  return (
    <div className="space-y-5">
      <ol aria-label="AWS connection progress" className="space-y-2">
        <ProgressStep complete label="Preparing secure connection" />
        <ProgressStep complete={callbackReceived} current={!callbackReceived} label="Create TerraFix role in AWS" />
        <ProgressStep complete={verified} current={session.status === "verifying" || session.status === "callback_received"} label="Verify AWS connection" />
        <ProgressStep complete={verified} label="Connected" />
      </ol>
      {!callbackReceived ? (
        <div className="rounded-lg border bg-secondary/30 p-4">
          <p className="text-sm font-medium">Waiting for AWS setup…</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Review the prepared permissions and create the stack. TerraFix connects automatically when CloudFormation finishes.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {launchUrl ? <a href={launchUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}><ExternalLink aria-hidden="true" />Open AWS Setup</a> : null}
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />Creating TerraFix role…</span>
          </div>
        </div>
      ) : !verified ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />Verifying AWS connection with STS…</p>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}

function ProgressStep({ complete = false, current = false, label }: { complete?: boolean; current?: boolean; label: string }) {
  return <li className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs", current && "border-foreground/25 bg-card", complete && "border-success/20 bg-success-muted")}><span className={cn("flex size-5 items-center justify-center rounded-full border", current && "border-foreground/30", complete && "border-success/30 bg-success text-white")}>{complete ? <Check aria-hidden="true" className="size-3" /> : current ? <LoaderCircle aria-hidden="true" className="size-3 animate-spin" /> : null}</span><span className="font-medium">{label}</span></li>;
}

function SecurityItem({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-2"><Check aria-hidden="true" className="size-3.5 text-success-foreground" />{children}</li>;
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-destructive"><TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{children}</p>;
}
