import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  ShoppingCart,
  Megaphone,
  Boxes,
  Calculator,
  Info,
  Shield,
  Lock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  currentUser,
  currentTenant,
  isRoomLocked,
  hasPermission,
  getFirstAllowedRoute,
  useDB,
  DEFAULT_ROOM_LOCKS,
  type RoomLock,
} from "@/lib/store";

export const Route = createFileRoute("/app/")({
  component: TenantHome,
});

const TOOLS = [
  {
    to: "/app/kasir",
    perm: "pos",
    label: "Ruang Kasir",
    desc: "POS, dashboard, rekap, kas, manajemen, riwayat, AI-sisten.",
    icon: ShoppingCart,
    tone: "from-blue-500 to-blue-700",
  },
  {
    to: "/app/pemasaran",
    perm: "pemasaran",
    label: "Ruang Pemasaran",
    desc: "Studio POSM Hybrid AI — bikin poster dalam detik.",
    icon: Megaphone,
    tone: "from-fuchsia-500 to-purple-700",
  },
  {
    to: "/app/stok",
    perm: "stok",
    label: "Ruang Stok",
    desc: "Inventaris multi-satuan & sinkron dengan Produk POS.",
    icon: Boxes,
    tone: "from-emerald-500 to-teal-700",
  },
  {
    to: "/app/modal",
    perm: "modal",
    label: "Tools Hitung Modal",
    desc: "HPP cerdas + rekomendasi harga jual AI.",
    icon: Calculator,
    tone: "from-amber-500 to-orange-700",
  },
  {
    to: "/app/info",
    perm: "all",
    label: "Ruang Info",
    desc: "Pengumuman & video dari Super-Admin.",
    icon: Info,
    tone: "from-slate-500 to-slate-700",
  },
  {
    to: "/app/pengaturan",
    perm: "all",
    label: "Pengaturan",
    desc: "Simpan Gemini API Key pribadi (BYOK) & preferensi akun.",
    icon: Shield,
    tone: "from-sky-500 to-indigo-700",
  },
] as const;

type RoomLockWithHidden = RoomLock & { hidden?: boolean };

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Pagi";
  if (h < 15) return "Siang";
  if (h < 18) return "Sore";
  return "Malam";
}

function TenantHome() {
  const me = currentUser();
  const t = currentTenant();
  const isMember = me?.role === "member";
  const isSuperAdmin = me?.role === "super_admin";

  // Baca roomLocks untuk cek hidden
  const roomLocks = useDB((d) =>
    (d.roomLocks || DEFAULT_ROOM_LOCKS) as RoomLockWithHidden[],
  );

  if (isMember) {
    const target = getFirstAllowedRoute(me);
    return <Navigate to={target} replace />;
  }

  return (
    <div className="space-y-6">
      <div className="neu p-4 sm:p-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
        <h1 className="mt-1 text-xl sm:text-3xl font-bold break-words">
          Selamat {greeting()}, <span className="text-primary">{me?.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t?.businessName ?? "Toko Anda"} &middot;{" "}
          {isMember ? "Anggota Tim" : me?.role === "owner" ? "Owner Toko" : "Super Admin"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const allowed = hasPermission(me, tool.perm);
          const lockInfo = !isSuperAdmin ? isRoomLocked(tool.to) : { locked: false, note: "" };

          if (!allowed) return null;

          // Sembunyikan card jika super admin set hidden (hanya berlaku untuk non-super-admin)
          if (!isSuperAdmin) {
            const roomLock = roomLocks.find(
              (l) => l.key === tool.to || tool.to.startsWith(l.key),
            );
            if (roomLock?.hidden) return null;
          }

          if (lockInfo.locked) {
            return (
              <div
                key={tool.to}
                onClick={() =>
                  toast.error(`Ruangan dikunci Super Admin: "${lockInfo.note || "Segera hadir"}"`)
                }
                className="relative neu p-5 sm:p-6 opacity-75 cursor-not-allowed border-2 border-amber-500/40 bg-amber-500/5 rounded-2xl"
              >
                <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-500 border border-amber-500/30">
                  <Lock size={12} /> {lockInfo.note || "Segera hadir"}
                </div>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-500">
                  <Icon size={26} />
                </div>
                <h3 className="mt-4 text-lg font-bold flex items-center gap-2">{tool.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tool.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-500">
                  <AlertCircle size={14} /> Keterangan: {lockInfo.note || "Dalam pemeliharaan"}
                </div>
              </div>
            );
          }

          return (
            <Link
              key={tool.to}
              to={tool.to}
              className="group neu p-5 sm:p-6 transition-transform hover:-translate-y-1 rounded-2xl"
            >
              <div
                className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.tone} text-white shadow-elegant`}
              >
                <Icon size={26} />
              </div>
              <h3 className="mt-4 text-lg font-bold">{tool.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tool.desc}</p>
              <span className="mt-4 inline-block text-xs font-semibold text-primary-glow group-hover:underline">
                Buka &rarr;
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
