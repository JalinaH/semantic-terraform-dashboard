import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "TerraFix",
    template: "%s · TerraFix",
  },
  description:
    "TerraFix provides evidence-backed Terraform diagnosis, isolated verification, and AI usage observability.",
  applicationName: "TerraFix",
  keywords: ["Terraform", "DevOps", "GitHub Actions", "AI", "Infrastructure as Code"],
  authors: [{ name: "TerraFix" }],
  openGraph: {
    type: "website",
    title: "TerraFix · Verified Terraform failure intelligence",
    description: "Evidence-backed Terraform diagnosis, isolated verification, and human-approved pull request updates.",
    siteName: "TerraFix",
  },
  twitter: {
    card: "summary",
    title: "TerraFix · Verified Terraform failure intelligence",
    description: "Evidence-backed Terraform diagnosis, isolated verification, and human-approved pull request updates.",
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={
          {
            "--font-app-sans":
              'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            "--font-app-mono":
              '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          } as React.CSSProperties
        }
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
