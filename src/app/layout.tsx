import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Netural Marktradar",
  description: "Kundenintelligenz-Plattform für Netural Kundenteams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Hind zur Laufzeit laden; Umstellung auf self-hosted Fonts in einer späteren Etappe */}
        <link
          href="https://fonts.googleapis.com/css2?family=Hind:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
