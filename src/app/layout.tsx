import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PriceNova — monthly draws and rewards", template: "%s · PriceNova" },
  description: "Enter the monthly draw, build your team, unlock rewards.",
};

export const viewport: Viewport = {
  themeColor: "#0b1210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
