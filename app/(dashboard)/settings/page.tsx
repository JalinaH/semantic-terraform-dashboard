import { Bell, CircleUserRound, Github, LockKeyhole, SlidersHorizontal } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const settings = [
  { icon: CircleUserRound, title: "Account", description: "User identity and workspace profile.", control: <Input value="Preview workspace" readOnly aria-label="Account name" /> },
  { icon: Github, title: "GitHub", description: "Authentication, installations, and repository permissions.", control: <Button variant="outline" disabled><LockKeyhole aria-hidden="true" />Connect GitHub</Button> },
  { icon: SlidersHorizontal, title: "Default model", description: "Applied when a repository has no model override.", control: <Select defaultValue="gemini-2.5-pro" aria-label="Default model"><option value="gemini-2.5-pro">gemini-2.5-pro</option><option value="gemini-2.5-flash">gemini-2.5-flash</option></Select> },
  { icon: SlidersHorizontal, title: "Default context mode", description: "Controls the bounded context collected for a diagnosis.", control: <Select defaultValue="smart" aria-label="Default context mode"><option value="minimal">Minimal</option><option value="smart">Smart</option><option value="full">Full</option></Select> },
  { icon: Bell, title: "Notifications", description: "Run outcomes and repository health alerts.", control: <div className="flex items-center gap-3"><Switch label="Run notifications" disabled /><Label className="text-muted-foreground">Run notifications</Label></div> },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Workspace" title="Settings" description="Phase 1 placeholders for account, integrations, model defaults, and future notifications." />
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {settings.map(({ icon: Icon, title, description, control }) => (
            <section key={title} className="grid gap-4 border-b p-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)] md:items-center md:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground"><Icon aria-hidden="true" className="size-4" /></span>
                <div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2><Badge variant="outline" className="bg-neutral-status-muted text-neutral-status">Coming later</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
              </div>
              <div className="md:justify-self-stretch">{control}</div>
            </section>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Authentication and persistent settings are intentionally unavailable in this foundation phase.</p>
    </div>
  );
}
