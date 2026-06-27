import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { RouteProgress } from "@/components/route-progress";
import "./globals.css";

const cursorGothic = localFont({
  src: [
    {
      path: "../public/fonts/cursor-gothic/CursorGothic-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/cursor-gothic/CursorGothic-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/cursor-gothic/CursorGothic-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/cursor-gothic/CursorGothic-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-cursor-gothic",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cursor Community | Event Coupon Distribution Platform",
  description:
    "Distribute Cursor credits to event attendees securely and track claims.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cursorGothic.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <RouteProgress />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
