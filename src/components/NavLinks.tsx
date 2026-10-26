"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/coordinators", label: "Coordinators" },
  { href: "/mapping", label: "Name mapping" },
  { href: "/upload", label: "Upload" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 font-semibold ${active ? "bg-navy text-white" : "text-navy hover:bg-[#eef2fa]"}`}
          >
            {l.label}
          </Link>
        );
      })}
      <form action="/api/logout" method="post" className="ml-auto">
        <button suppressHydrationWarning className="rounded-md px-3 py-1.5 font-semibold text-muted hover:bg-[#eef2fa]">Sign out</button>
      </form>
    </nav>
  );
}
