import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchoolDesk · School management",
  description: "SchoolDesk school management workspace — interactive design preview with sample data.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
