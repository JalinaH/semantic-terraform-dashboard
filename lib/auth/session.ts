import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/?auth=required");
  return session.user;
}
