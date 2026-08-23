"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("TerraFix dashboard render failed", { digest: error.digest ?? "not_available" });
  return (
    <Card className="border-warning/25">
      <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning-foreground"><TriangleAlert aria-hidden="true" className="size-5" /></span>
        <div className="flex-1">
          <h1 className="text-base font-semibold">TerraFix is temporarily unavailable</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">The dashboard could not load this view. Your repository and run data were not changed.</p>
          {error.digest ? <p className="mt-2 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p> : null}
        </div>
        <Button type="button" variant="outline" onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  );
}
