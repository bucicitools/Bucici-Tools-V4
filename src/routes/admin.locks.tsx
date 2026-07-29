import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Unlock, Save, AlertTriangle, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type RoomLock, DEFAULT_ROOM_LOCKS } from "@/lib/store";

export const Route = createFileRoute("/admin/locks")({
  component: AdminLocksPage,
});

type RoomLockWithHidden = RoomLock & { hidden?: boolean };

function AdminLocksPage() {
  const currentLocks = useDB((d) => d.roomLocks || DEFAULT_ROOM_LOCKS);
  const [locks, setLocks] = useState<RoomLockWithHidden[]>(() =>
    (currentLocks.length ? currentLocks : DEFAULT_ROOM_LOCKS).map((l) => ({
      ...l,
      hidden: (l as RoomLockWithHidden).hidden ?? false,
    })),
  );
  const [loading, setLoading] = useState(false);

  function toggleLock(key: string) {
    setLocks((prev) => prev.map((l) => (l.key === key ? { ...l, locked: !l.locked } : l)));
  }

  function toggleHide(key: string) {
    setLocks((prev) =>
      prev.map((l) => (l.key === key ? { ...l, hidden: !(l.hidden ?? false) } : l)),
    );
  }

  function updateNote(key: string, note: string) {
    setLocks((prev) => prev.map((l) => (l.key === key ? { ...l, note } : l)));
  }

  function handleSave() {
    setLoading(true);
    db.set((n) => {
      n.roomLocks = locks;
    });
    toast.success("Pengaturan kunci & sembunyikan berhasil diperbarui!");
    setLoading(false);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="text-primary" size={24} /> Kunci & Sembunyikan Ruangan
          </h1>
          <p className="text-sm text-muted-foreground">
            Kelola tampilan card ruangan di beranda Owner Tenant.
            Kunci menampilkan badge pesan. Sembunyikan menghilangkan card sepenuhnya.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 transition disabled:opacity-50"
        >
          <Save size={16} /> {loading ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {locks.map((room) => {
          const isLocked = room.locked;
          const isHidden = room.hidden ?? false;

          return (
            <div
              key={room.key}
              className={`neu p-5 rounded-2xl border transition-all ${
                isHidden
                  ? "border-slate-500/50 bg-slate-500/5"
                  : isLocked
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-border/50 hover:border-border"
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className={`p-2 rounded-xl ${
                    isHidden
                      ? "bg-slate-500/20 text-slate-400"
                      : isLocked
                        ? "bg-amber-500/20 text-amber-500"
                        : "bg-emerald-500/20 text-emerald-500"
                  }`}
                >
                  {isHidden ? <EyeOff size={18} /> : isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-base">{room.name}</h3>
                  <code className="text-[11px] text-muted-foreground font-mono">{room.key}</code>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-3 pt-3 border-t border-border/30">
                {/* Toggle Kunci */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {isLocked
                      ? <Lock size={14} className="text-amber-500" />
                      : <Unlock size={14} className="text-muted-foreground" />}
                    <span className={isLocked ? "font-semibold text-amber-500" : "text-muted-foreground"}>
                      Kunci
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold ${
                      isLocked ? "bg-amber-500/20 text-amber-500" : "bg-muted/50 text-muted-foreground"
                    }`}>
                      {isLocked ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleLock(room.key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isLocked ? "bg-amber-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isLocked ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {/* Toggle Sembunyikan */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {isHidden
                      ? <EyeOff size={14} className="text-slate-400" />
                      : <Eye size={14} className="text-muted-foreground" />}
                    <span className={isHidden ? "font-semibold text-slate-400" : "text-muted-foreground"}>
                      Sembunyikan
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold ${
                      isHidden ? "bg-slate-500/20 text-slate-400" : "bg-muted/50 text-muted-foreground"
                    }`}>
                      {isHidden ? "Disembunyikan" : "Tampil"}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleHide(room.key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isHidden ? "bg-slate-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isHidden ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {/* Note field — hanya saat dikunci */}
                {isLocked && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                      Pesan badge (saat dikunci):
                    </span>
                    <input
                      value={room.note}
                      onChange={(e) => updateNote(room.key, e.target.value)}
                      placeholder="misal: Segera hadir, Dalam perbaikan, dll."
                      className="w-full rounded-xl neu-inset px-3 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-500 font-medium">
                      <AlertTriangle size={13} />
                      <span>Badge yang tampil: "{room.note || "Segera hadir"}"</span>
                    </div>
                  </div>
                )}

                {isHidden && !isLocked && (
                  <p className="text-[11px] text-slate-400 pt-1">
                    Card ini tidak akan tampil di beranda tenant.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
