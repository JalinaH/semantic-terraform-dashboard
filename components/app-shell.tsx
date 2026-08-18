"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar className="fixed inset-y-0 left-0 z-40 hidden lg:flex" />
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <AppSidebar className="relative z-10 shadow-2xl" onNavigate={() => setMobileOpen(false)} />
          <Button aria-label="Close navigation" size="icon" variant="secondary" className="absolute left-[260px] top-3 z-20" onClick={() => setMobileOpen(false)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="lg:pl-[248px]">
        <AppHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
