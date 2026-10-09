import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/lib/theme/provider";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEXO", template: "%s · NEXO" },
  description: "Seu dinheiro. Tudo conectado.",
  applicationName: "NEXO",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#241127" },
    { media: "(prefers-color-scheme: light)", color: "#FBF6F9" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme} className={GeistSans.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <ToastProvider>
          <ThemeProvider initial={theme}>{children}</ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
