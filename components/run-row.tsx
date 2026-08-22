import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { RunListItem } from "@/lib/runs/types";
import { formatCompactTokens, formatUsd } from "@/lib/analytics/format";
import { formatRuntime, truncateSha } from "@/lib/utils";

export function RunRow({ run }: { run: RunListItem }) {
  return (
    <tr className="border-b transition-colors last:border-b-0 hover:bg-secondary/25">
      <td className="px-4 py-3.5">
        <Link href={`/runs/${run.id}`} className="group/link inline-flex items-center gap-1 font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
          {run.repositoryFullName}
          <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-0 group-hover/link:opacity-100" />
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-muted-foreground">
        {run.pullRequestNumber ? `PR #${run.pullRequestNumber}` : truncateSha(run.commitSha)}
      </td>
      <td className="max-w-56 px-4 py-3.5 font-mono text-xs"><span className="block truncate">{run.affectedResource ?? "—"}</span></td>
      <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={run.verificationStatus} /></td>
      <td className="hidden max-w-52 px-4 py-3.5 font-mono text-xs text-muted-foreground lg:table-cell"><span className="block truncate" title={run.displayModel ?? undefined}>{run.displayModel ?? "Not reported"}</span></td>
      <td className="hidden whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs text-muted-foreground lg:table-cell">{formatCompactTokens(run.totalTokens)}</td>
      <td className="hidden whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs text-muted-foreground xl:table-cell" title={run.costComplete === false ? "Incomplete provider reporting" : undefined}>{run.llmCostUsd === null ? "Not reported" : formatUsd(run.llmCostUsd, { freeLabel: run.costComplete === true && Number(run.llmCostUsd) === 0 })}</td>
      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">{run.totalRuntimeMs === null ? "—" : formatRuntime(run.totalRuntimeMs)}</td>
    </tr>
  );
}
