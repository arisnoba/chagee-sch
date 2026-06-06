"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "차지 근무표", brand: true },
  { href: "/employees", label: "직원 관리" },
  { href: "/shift-parts", label: "파트 관리" },
  { href: "/schedule/generate", label: "근무표 생성" },
  { href: "/schedule/month", label: "월간 근무표" },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="no-print border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {NAV_LINKS.map((link) => {
          const active = isActivePath(pathname, link.href);
          const className = link.brand
            ? `text-lg font-bold ${active ? "text-gray-950" : "text-gray-900 hover:text-gray-600"}`
            : `rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={className}
            >
              {link.brand ? `🍵 ${link.label}` : link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
