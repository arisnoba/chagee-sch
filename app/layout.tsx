import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "차지 근무표",
  description: "공평한 근무표 자동 생성 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <AppNav />
        <main className="mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
