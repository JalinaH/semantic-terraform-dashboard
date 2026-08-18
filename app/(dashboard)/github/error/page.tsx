import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getGitHubErrorMessage } from "@/lib/github/errors";
import { cn } from "@/lib/utils";

export default async function GitHubErrorPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card><CardContent className="flex flex-col items-center px-6 py-12 text-center"><span className="flex size-11 items-center justify-center rounded-lg border bg-destructive/5 text-destructive"><CircleAlert aria-hidden="true" className="size-5" /></span><h2 className="mt-5 text-lg font-semibold">GitHub connection was not completed</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{getGitHubErrorMessage(code)}</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Link href="/github/install" className={cn(buttonVariants())}><RotateCcw aria-hidden="true" />Try again</Link><Link href="/repositories" className={cn(buttonVariants({ variant: "outline" }))}>Back to repositories</Link></div></CardContent></Card>
    </div>
  );
}
