"use client";

/**
 * The left menu — v0.6.0: the unified Gershon.ai look (Olivier, 2026-10-13:
 * Linalysis design is the master, Gershon.ai red the main colour): white
 * 248px rail, red pill on the current page, #e5e7eb borders.
 * (Was v4.9.0 "Charcoal & Signal Red", inherited from Social.)
 *
 * Dark charcoal rail, grouped sections (Overview · Portfolio · System ·
 * Workspace). Red appears only as the thin marker on the current page, so the
 * content area stays the focus. Routes and order are unchanged from v2.6.0.
 */

import { SocialMark, SocialWordmark } from "@/components/brand/social-mark";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  LayoutList,
  Settings,
  Users,
  LogOut,
  ScrollText,
  AlertOctagon,
  Network,
  PlayCircle,
  StopCircle,
  Rocket,
  Puzzle,
  Send,
  BookOpen, ClipboardCheck, FileText, Newspaper} from "lucide-react";
import { useDemoMode, setDemoMode } from "@/lib/use-demo-mode";
import { FilterPanel } from "./filter-panel";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  children?: { href: string; label: string }[];
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Tracking",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/summary", icon: ClipboardCheck, label: "Summary" },
      { href: "/onepager", icon: Newspaper, label: "Client one-pagers" },
      { href: "/reports", icon: FileText, label: "Monthly reports" },
      { href: "/clients", icon: Building2, label: "Companies" },
      { href: "/extension", icon: Puzzle, label: "Extension" },
    ],
  },
];

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").replace(/[^A-Za-z ]/g, " ").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role?.toLowerCase() ?? "user";
  // v0.6.1: no "Getting started" (/welcome is a Social page, not ours).
  const groups = navGroups;

  return (
    <aside className="w-[248px] flex-shrink-0 bg-white text-gray-700 flex flex-col h-screen sticky top-0 border-r border-[#e5e7eb]">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-[#e5e7eb]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <SocialMark size={32} className="flex-shrink-0" />
          <SocialWordmark />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {groups.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[#CC3333] text-white shadow-sm"
                        : "text-gray-600 hover:bg-[#fdf2f2] hover:text-[#a8281f]"
                    )}
                  >
                    <item.icon className="flex-shrink-0" size={17} strokeWidth={1.8} />
                    {item.label}
                  </Link>
                  {item.children && isActive && (
                    <div className="mt-0.5 mb-1 ml-[30px] pl-2.5 border-l border-[#e5e7eb] space-y-0.5">
                      {item.children.map((sub) => {
                        // A child that shares its parent's href is active on that exact page only.
                        const subActive =
                          pathname === sub.href || (sub.href !== item.href && pathname.startsWith(sub.href + "/"));
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              "block px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                              subActive ? "text-[#a8281f] bg-[#fdf2f2]" : "text-gray-500 hover:text-[#1d1d1f]"
                            )}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* View filters — category / month / network, applied across the
            dashboard views. Hidden on pages the filters don't drive. */}
        <FilterPanel />
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-[#e5e7eb]">
        
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-[#fdf2f2] text-[#a8281f] text-xs font-semibold flex items-center justify-center flex-shrink-0">
            {initials(session?.user?.name, session?.user?.email)}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium text-[#1d1d1f] truncate">{session?.user?.name}</div>
            <div className="text-xs text-gray-500 truncate capitalize">{role}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sign out"
            title="Sign out"
            className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-[#1d1d1f] transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function DemoToggleButton() {
  const demoOn = useDemoMode();
  return (
    <button
      onClick={() => {
        setDemoMode(!demoOn);
        // Force a hard reload so page data refetches with the new flag.
        setTimeout(() => { window.location.reload(); }, 80);
      }}
      title={demoOn ? "Currently showing FAKE demo data. Click to switch back to real." : "Switch to fake demo data — every chart full, every number inflated."}
      className={
        "w-full flex items-center gap-2.5 px-2.5 py-1.5 mb-1 rounded-md text-[13px] font-medium transition-colors " +
        (demoOn
          ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40"
          : "text-[#8E949F] hover:bg-[#1A1D23] hover:text-white")
      }
    >
      {demoOn ? <StopCircle size={15} /> : <PlayCircle size={15} />}
      {demoOn ? "Demo mode ON" : "Demo mode"}
    </button>
  );
}
