import { Outlet, createFileRoute, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { LogOut, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BuciciLogo } from "@/components/BuciciLogo";
import {
  currentUser,
  currentTenant,
  logout,
  isAuthReady,
  subscribeAuthReady,
  isRoomLocked,
  hasPermission,
  getFirstAllowedRoute,
} from "@/lib/store";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function getPermForPath(p: string): string {
  if (p.startsWith("/app/kasir/pos")) return "pos";
  if (p.startsWith("/app/kasir/rekap")) return "rekap";
  if (p.startsWith("/app/kasir/kas")) return "kas";
  if (p.startsWith("/app/kasir/manajemen")) return "manajemen";
  if (p.startsWith("/app/kasir/riwayat")) return "riwayat";
  if (p.startsWith("/app/kasir/struk")) return "struk";
  if (p.startsWith("/app/kasir/ai")) return "ai";
  if (p.startsWith("/app/stok")) return "stok";
  if (p.startsWith("/app/pemasaran")) return "pemasaran";
  if (p.startsWith("/app/modal")) return "modal";
  return "all";
}

function AppLayout() {
  const navigate = useNavigate();
  const ready = useSyncExternalStore(subscribeAuthReady, isAuthReady, () => false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = currentUser();
  const tenant = currentTenant();

  useEffect(() => {
    if (!ready) return;
    const u = currentUser();
    if (!u) {
      navigate({ to: "/" });
      return;
    }

    // Check Room Lock (if not super_admin)
    if (u.role !== "super_admin") {
      const lockInfo = isRoomLocked(pathname);
      if (lockInfo.locked) {
        toast.error(`Ruangan ini dikunci Super Admin: "${lockInfo.note || "Segera hadir"}"`);
        navigate({ to: "/app" });
        return;
      }
    }

    // Check Role Permission (if member)
    if (u.role === "member") {
      if (
        pathname === "/app" ||
        pathname === "/app/" ||
        pathname === "/app/kasir" ||
        pathname === "/app/kasir/"
      ) {
        const target = getFirstAllowedRoute(u);
        navigate({ to: target });
        return;
      }
      const permKey = getPermForPath(pathname);
      if (!hasPermission(u, permKey)) {
        toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
        const target = getFirstAllowedRoute(u);
        navigate({ to: target });
      }
    }
  }, [navigate, pathname, ready]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-metallic flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="min-h-screen bg-metallic">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          {pathname !== "/app" && me.role !== "member" && (
            <Link to="/app" className="rounded-lg neu-sm p-2" aria-label="Kembali">
              <ArrowLeft size={16} />
            </Link>
          )}
          <BuciciLogo size={32} showTagline={false} />
          <div className="hidden sm:block">
            <div className="text-sm font-bold">{tenant?.businessName ?? "BUCICI"}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {me.role === "owner" ? "Owner" : me.role === "member" ? "Karyawan" : "Admin"}
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
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
