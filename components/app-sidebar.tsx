"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, ExternalLink, Github } from "lucide-react";
import { TerraFixLogo } from "@/components/terrafix-logo";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AppSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className={cn("flex h-full w-[248px] flex-col border-r bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <TerraFixLogo size={32} priority className="shadow-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">TerraFix</p>
          <p className="text-[11px] text-muted-foreground">Terraform CI diagnosis</p>
        </div>
      </div>

      <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 px-3 py-5">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2",
                active && "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_70%,transparent)]",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <div className="rounded-lg border bg-card/60 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Command aria-hidden="true" className="size-3.5" />
            Engine boundary
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Semantic Terraform Agent v1.0.0 runs only in the isolated worker.</p>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Github aria-hidden="true" className="size-3" />CLI</span>
            <span className="inline-flex items-center gap-1"><ExternalLink aria-hidden="true" className="size-3" />Actions</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
