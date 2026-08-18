import Link from "next/link";
import { Github, ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const messages: Record<string, string> = {
  AccessDenied: "GitHub sign-in was denied. No dashboard session was created.",
  Configuration: "GitHub authentication is not configured correctly for this environment.",
  OAuthCallbackError: "GitHub could not complete the authorization callback. Please try again.",
  OAuthAccountNotLinked: "This GitHub account is already associated with another dashboard identity.",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const message = error && messages[error] ? messages[error] : "GitHub authentication could not be completed. Please try again.";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg"><CardContent className="flex flex-col items-center px-6 py-12 text-center"><span className="flex size-11 items-center justify-center rounded-lg border bg-destructive/5 text-destructive"><ShieldAlert aria-hidden="true" className="size-5" /></span><h1 className="mt-5 text-lg font-semibold">Sign-in interrupted</h1><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p><Link href="/" className={cn(buttonVariants(), "mt-6")}><Github aria-hidden="true" />Return to sign in</Link></CardContent></Card>
    </main>
  );
}
