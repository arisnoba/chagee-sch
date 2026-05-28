import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
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
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
          <Link href="/" className="font-bold text-lg text-gray-900 hover:text-gray-600">
            🍵 차지 근무표
          </Link>
          <Link href="/employees" className="text-sm text-gray-600 hover:text-gray-900">
            직원 관리
          </Link>
          <Link href="/schedule/generate" className="text-sm text-gray-600 hover:text-gray-900">
            근무표 생성
          </Link>
        </nav>
        <main className="max-w-6xl mx-auto w-full px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
