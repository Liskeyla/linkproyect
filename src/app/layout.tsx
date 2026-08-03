import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkProject — Seguimiento de requerimientos",
  description: "Seguimiento de requerimientos por etapa con login y datos compartidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
