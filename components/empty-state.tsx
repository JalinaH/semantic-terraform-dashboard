import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ icon: Icon, title, description, actionLabel }: { icon: LucideIcon; title: string; description: string; actionLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border bg-secondary text-muted-foreground"><Icon aria-hidden="true" className="size-4" /></span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">{description}</p>
      {actionLabel ? <Button className="mt-5" size="sm" disabled>{actionLabel}</Button> : null}
    </div>
  );
}
