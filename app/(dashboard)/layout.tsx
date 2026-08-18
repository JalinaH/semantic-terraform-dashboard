import { AppShell } from "@/components/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  return <AppShell user={user}>{children}</AppShell>;
}
