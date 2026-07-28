import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { Building2, KeyRound, Megaphone, Sparkles, Lock, LogOut, Loader2 } from "lucide-react";
import { BuciciLogo } from "@/components/BuciciLogo";
import { currentUser, logout, isAuthReady, subscribeAuthReady } from "@/lib/store";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV = [
  { to: "/admin/tenants", label: "Tenants", icon: Building2 },
  { to: "/admin/locks", label: "Lock Modul", icon: Lock },
  { to: "/admin/license", label: "License", icon: KeyRound },
  { to: "/admin/info", label: "Info Post", icon: Megaphone },
  { to: "/admin/ai", label: "AI-sisten", icon: Sparkles },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const ready = useSyncExternalStore(subscribeAuthReady, isAuthReady, () => false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!ready) return;
    const me = currentUser();
    if (!me) navigate({ to: "/" });
    else if (me.role !== "super_admin") navigate({ to: "/app" });
  }, [navigate, ready]);

  useEffect(() => {
    if (ready && pathname === "/admin") navigate({ to: "/admin/tenants" });
  }, [ready, pathname, navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-metallic flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }
  const me = currentUser();
  if (!me || me.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-metallic">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <BuciciLogo size={36} showTagline={false} />
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-primary">SUPER-ADMIN</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Console
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={async () => {
                await logout();
                navigate({ to: "/" });
              }}
              className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive"
            >
              <LogOut size={14} /> Keluar
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
