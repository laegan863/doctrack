"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { logout } from "@/app/login/actions";
import { CommandPalette } from "./command-palette";

type NavItem = { href: string; label: string; icon: string; ready: boolean };

const sections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: "▦", ready: true },
      { href: "/incoming/new", label: "New Incoming", icon: "↓", ready: true },
      { href: "/outgoing/new", label: "New Outgoing", icon: "↑", ready: true },
      { href: "/documents", label: "Documents", icon: "☰", ready: false },
      { href: "/locations", label: "Where are my documents?", icon: "⌖", ready: true },
      { href: "/search", label: "Search", icon: "⌕", ready: true },
      { href: "/reports", label: "Reports", icon: "▤", ready: false },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/settings/divisions", label: "Divisions & Units", icon: "⚑", ready: true },
      { href: "/settings/document-types", label: "Document Types", icon: "⚙", ready: true },
    ],
  },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden print:hidden">
        <span className="font-semibold">DocTrack</span>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ml-auto mr-2 rounded-md px-2 py-1 text-slate-600 ring-1 ring-slate-300"
          aria-label="Search"
        >
          ⌕
        </button>
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
        className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white lg:flex print:hidden`}
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

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => {
              setSearchOpen(true);
              close();
            }}
            className="flex w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-left text-sm text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200/60"
          >
            <span>⌕</span>
            Search…
            <kbd className="ml-auto rounded border border-slate-300 bg-white px-1.5 text-[10px] text-slate-500">Ctrl K</kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {/* The active highlight needs the URL, which is request-time data: stream it in. */}
          <Suspense fallback={<NavSections pathname={null} onNavigate={close} />}>
            <ActiveNavSections onNavigate={close} />
          </Suspense>
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

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function ActiveNavSections({ onNavigate }: { onNavigate: () => void }) {
  return <NavSections pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavSections({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate: () => void;
}) {
  const isActive = (href: string) =>
    pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
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
                  onClick={onNavigate}
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
    </>
  );
}
