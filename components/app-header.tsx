"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PAGE_TITLES } from "@/lib/constants";

function getTitle(pathname: string) {
  if (pathname.startsWith("/repositories/") && pathname !== "/repositories") return "Repository settings";
  if (pathname.startsWith("/runs/") && pathname !== "/runs") return "Run details";
  return PAGE_TITLES[pathname] ?? "Dashboard";
}

export function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button aria-label="Open navigation" variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onMenuClick}>
          <Menu aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{getTitle(pathname)}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">Semantic diagnosis · isolated verification · human review</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <button aria-label="Open preview user menu" className="flex h-9 items-center gap-2 rounded-md px-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-semibold text-primary-foreground">ST</span>
          <span className="hidden text-xs font-medium sm:inline">Preview</span>
          <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground sm:block" />
        </button>
      </div>
    </header>
  );
}
