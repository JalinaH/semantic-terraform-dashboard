"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PAGE_TITLES } from "@/lib/constants";

function getTitle(pathname: string) {
  if (pathname === "/github/install") return "Connect GitHub";
  if (pathname === "/github/error") return "GitHub connection";
  if (pathname.endsWith("/aws") && pathname.startsWith("/repositories/")) return "AWS connection";
  if (pathname.startsWith("/repositories/") && pathname !== "/repositories") return "Repository settings";
  if (pathname.startsWith("/runs/") && pathname !== "/runs") return "Run details";
  return PAGE_TITLES[pathname] ?? "Dashboard";
}

interface HeaderUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  githubLogin: string | null;
  avatarUrl: string | null;
}

export function AppHeader({ onMenuClick, user }: { onMenuClick: () => void; user: HeaderUser }) {
  const pathname = usePathname();
  const avatar = user.avatarUrl ?? user.image;
  const displayName = user.name ?? user.githubLogin ?? "GitHub user";

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
        <details className="group relative">
          <summary aria-label="Open user menu" className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            {avatar ? <Image src={avatar} alt="" width={28} height={28} className="size-7 rounded-full border object-cover" /> : <span className="flex size-7 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-semibold text-primary-foreground">{displayName.slice(0, 2).toUpperCase()}</span>}
            <span className="hidden max-w-28 truncate text-xs font-medium sm:inline">{user.githubLogin ?? displayName}</span>
            <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground transition-transform group-open:rotate-180 sm:block" />
          </summary>
          <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.githubLogin ? `@${user.githubLogin}` : user.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <form action={signOutAction}>
              <button type="submit" className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"><LogOut aria-hidden="true" className="size-4" />Sign out</button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
