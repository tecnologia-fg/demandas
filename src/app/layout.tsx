import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { FeedbackProvider } from "@/components/ui/overlay";
import { getCurrentUser } from "@/server/auth/current";
import { accentCss } from "@/lib/accent";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Dmanda", template: "%s · Dmanda" },
  description: "Gestão de demandas da equipe em quadros",
  applicationName: "Dmanda",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFECF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0A12" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("demanda_theme")?.value;
  // cor do sistema escolhida pela pessoa (sobrescreve os tokens de destaque)
  const me = await getCurrentUser();
  const accent = accentCss(me?.accentColor);
  // intensidade do vidro escolhida na barrinha do perfil (0 a 1)
  const gl = Math.max(0, Math.min(100, me?.glassLevel ?? 100)) / 100;
  return (
    <html
      lang="pt-BR"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ "--gl": String(gl) } as React.CSSProperties}
    >
      <body className="min-h-full font-sans">
        <style id="cor-do-sistema" dangerouslySetInnerHTML={{ __html: accent }} />
        <div className="backdrop-blobs" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
