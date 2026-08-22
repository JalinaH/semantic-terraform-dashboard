import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tierStyles: Record<string, string> = {
  free: "border-success/25 bg-success-muted text-success-foreground",
  economy: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  balanced: "border-warning/25 bg-warning-muted text-warning-foreground",
  premium: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function ModelTierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <Badge variant="outline">Not reported</Badge>;
  return <Badge variant="outline" className={cn("uppercase", tierStyles[tier.toLowerCase()])} title="TerraFix model tiers represent configured cost and access policy, not a universal quality ranking.">{tier}</Badge>;
}
