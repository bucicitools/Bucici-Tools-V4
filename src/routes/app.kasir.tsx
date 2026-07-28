import { Outlet, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  BarChart3,
  Wallet,
  Settings2,
  History,
  Receipt,
  Sparkles,
} from "lucide-react";
import { currentUser, hasPermission } from "@/lib/store";

export const Route = createFileRoute("/app/kasir")({
  component: KasirLayout,
});

const NAV = [
  {
    to: "/app/kasir",
    perm: "dashboard",
    ownerOnly: true,
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { to: "/app/kasir/pos", perm: "pos", label: "POS", icon: ShoppingCart, exact: false },
  { to: "/app/kasir/rekap", perm: "rekap", label: "Rekapan", icon: BarChart3, exact: false },
  { to: "/app/kasir/kas", perm: "kas", label: "Kas", icon: Wallet, exact: false },
  {
    to: "/app/kasir/manajemen",
    perm: "manajemen",
    label: "Manajemen",
    icon: Settings2,
    exact: false,
  },
  { to: "/app/kasir/riwayat", perm: "riwayat", label: "Riwayat", icon: History, exact: false },
  { to: "/app/kasir/struk", perm: "struk", label: "Struk", icon: Receipt, exact: false },
  { to: "/app/kasir/ai", perm: "ai", label: "AI-sisten", icon: Sparkles, exact: false },
] as const;

function KasirLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = currentUser();

  const filteredNav = NAV.filter((n) => {
    if ("ownerOnly" in n && n.ownerOnly && me?.role === "member") return false;
    return hasPermission(me, n.perm);
  });

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto neu-inset p-1 rounded-2xl">
        {filteredNav.map((n) => {
          const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition ${active ? "bg-gradient-primary text-primary-foreground shadow-elegant" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon size={14} /> {n.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
