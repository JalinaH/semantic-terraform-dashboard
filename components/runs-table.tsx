import { RunRow } from "@/components/run-row";
import type { RunListItem } from "@/lib/runs/types";

export function RunsTable({ runs }: { runs: RunListItem[] }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b bg-secondary/30 text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">Repository</th>
            <th scope="col" className="px-4 py-3 font-medium">PR / Commit</th>
            <th scope="col" className="px-4 py-3 font-medium">Resource</th>
            <th scope="col" className="px-4 py-3 font-medium">Verification</th>
            <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Model</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-medium lg:table-cell">Tokens</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-medium xl:table-cell">Cost</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Runtime</th>
          </tr>
        </thead>
        <tbody>{runs.map((run) => <RunRow key={run.id} run={run} />)}</tbody>
      </table>
    </div>
  );
}
