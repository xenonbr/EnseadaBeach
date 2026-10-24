"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 shrink-0 items-center rounded-xl px-4 font-semibold transition-colors ${
        active ? "bg-white text-ocean" : "text-white hover:bg-white/15"
      }`}
    >
      {children}
    </Link>
  );
}
