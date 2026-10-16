import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/lib/theme/provider";
import { normalizePalette, PALETTES, PALETTE_COOKIE } from "@/lib/theme/palettes";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEXO", template: "%s · NEXO" },
  description: "Seu dinheiro. Tudo conectado.",
  applicationName: "NEXO",
  manifest: "/manifest.webmanifest",
};

export async function generateViewport(): Promise<Viewport> {
  const store = await cookies();
  const palette = PALETTES.find((p) => p.id === normalizePalette(store.get(PALETTE_COOKIE)?.value))!;
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: dark)", color: palette.themeColor.dark },
      { media: "(prefers-color-scheme: light)", color: palette.themeColor.light },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = normalizeTheme(store.get(THEME_COOKIE)?.value);
  const palette = normalizePalette(store.get(PALETTE_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme} data-palette={palette} className={GeistSans.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <ToastProvider>
          <ThemeProvider initial={theme} initialPalette={palette}>{children}</ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
