import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="overflow-hidden rounded-xl border bg-[oklch(0.135_0.01_262)] text-[oklch(0.88_0.01_260)] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-white/60">
        <span className="inline-flex items-center gap-2"><FileCode2 aria-hidden="true" className="size-3.5" />Suggested patch</span>
        <span className="font-mono">unified diff</span>
      </div>
      <pre className="scrollbar-thin overflow-x-auto py-3 font-mono text-xs leading-6">
        <code>
          {lines.map((line, index) => (
            <span
              key={`${index}-${line}`}
              className={cn(
                "block min-w-max px-4",
                line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-400/10 text-emerald-300",
                line.startsWith("-") && !line.startsWith("---") && "bg-red-400/10 text-red-300",
                line.startsWith("@@") && "text-sky-300",
                (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) && "text-white/45",
              )}
            >
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
