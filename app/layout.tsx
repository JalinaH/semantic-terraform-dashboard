import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TerraFix",
    template: "%s · TerraFix",
  },
  description:
    "TerraFix provides evidence-backed Terraform diagnosis, isolated verification, and AI usage observability.",
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
