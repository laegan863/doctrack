"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";

type NavItem = { href: string; label: string; icon: string; ready: boolean };

const sections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: "▦", ready: true },
      { href: "/incoming/new", label: "New Incoming", icon: "↓", ready: false },
      { href: "/outgoing/new", label: "New Outgoing", icon: "↑", ready: false },
      { href: "/documents", label: "Documents", icon: "☰", ready: false },
      { href: "/locations", label: "Where are my documents?", icon: "⌖", ready: false },
      { href: "/search", label: "Search", icon: "⌕", ready: false },
      { href: "/reports", label: "Reports", icon: "▤", ready: false },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/settings/divisions", label: "Divisions & Units", icon: "⚑", ready: false },
      { href: "/settings/document-types", label: "Document Types", icon: "⚙", ready: false },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-semibold">DocTrack</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md px-2 py-1 text-slate-600 ring-1 ring-slate-300"
          aria-label="Toggle menu"
        >
          ☰
        </button>
      </div>

      <aside
        className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white lg:flex`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            DT
          </div>
          <div>
            <div className="font-semibold leading-tight">DocTrack</div>
            <div className="text-xs text-slate-500">IMISS Document Tracking</div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {sections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {section.title}
                </div>
              )}
              <ul className="space-y-1">
                {section.items.map((item) =>
                  item.ready ? (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive(item.href)
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="w-4 text-center">{item.icon}</span>
                        {item.label}
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={item.href}
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
                      title="Coming in a later phase"
                    >
                      <span className="w-4 text-center">{item.icon}</span>
                      {item.label}
                      <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] uppercase">
                        soon
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>

        <form action={logout} className="border-t border-slate-200 p-3">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ⎋ Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
