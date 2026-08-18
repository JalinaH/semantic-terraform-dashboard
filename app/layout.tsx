import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Semantic Terraform Agent",
    template: "%s · Semantic Terraform Agent",
  },
  description:
    "Evidence-backed diagnosis and isolated verification for semantic Terraform CI failures.",
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
