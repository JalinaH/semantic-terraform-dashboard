import { cn } from "@/lib/utils";

export function Switch({ defaultChecked = false, disabled = false, label, className }: { defaultChecked?: boolean; disabled?: boolean; label: string; className?: string }) {
  return (
    <label className={cn("relative inline-flex items-center", disabled && "cursor-not-allowed opacity-50", className)}>
      <input type="checkbox" role="switch" aria-label={label} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
      <span className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
      <span className="absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 dark:bg-foreground" />
    </label>
  );
}
