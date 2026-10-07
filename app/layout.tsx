import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HW1: CWA 天氣預報網站 using AI Agent",
  description: "Taiwan Central Weather Administration Open Data API (O-A0003-001) Integration & GIS Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100 font-sans">
        {children}
      </body>
    </html>
  );
}
