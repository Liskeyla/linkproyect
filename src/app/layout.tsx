import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMS Project Manager — Seguimiento de requerimientos",
  description: "LMS Project Manager: seguimiento de requerimientos por etapa con login y datos por usuario",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
