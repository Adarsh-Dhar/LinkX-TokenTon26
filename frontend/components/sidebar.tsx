"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  LineChart,
  MessageSquare,
  Settings,
  Terminal,
  Zap,
  BarChart,
  X,
} from "lucide-react";

const routes = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    color: "text-sky-500",
  },
  {
    label: "Alpha Market",
    icon: ShoppingCart,
    href: "/market",
    color: "text-pink-700",
  },
  {
    label: "Chat Agent",
    icon: MessageSquare,
    href: "/chat",
    color: "text-orange-700",
  },
  {
    label: "Node Register",
    icon: Zap,
    href: "/node_register",
    color: "text-emerald-400",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      {isOpen && (
        <div className="h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 text-white w-64 border-r border-border/30 flex flex-col relative">
          <div className="px-4 py-4 flex items-center justify-between border-b border-border/30">
            <Link href="/dashboard" className="flex items-center flex-1">
              <Terminal className="h-7 w-7 mr-3 text-green-500" />
              <h1 className="text-xl font-bold">Alpha Agent</h1>
            </Link>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition text-zinc-400 hover:text-white flex-shrink-0"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-3 py-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              {routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                    pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                  )}
                >
                  <div className="flex items-center flex-1">
                    <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                    {route.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-4 top-20 p-2.5 hover:bg-white/10 rounded-lg transition text-zinc-400 hover:text-white bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border border-border/30 z-50"
          aria-label="Open sidebar"
        >
          <BarChart className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
