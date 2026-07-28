import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Unlock, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type RoomLock, DEFAULT_ROOM_LOCKS } from "@/lib/store";

export const Route = createFileRoute("/admin/locks")({
  component: AdminLocksPage,
});

function AdminLocksPage() {
  const currentLocks = useDB((d) => d.roomLocks || DEFAULT_ROOM_LOCKS);
  const [locks, setLocks] = useState<RoomLock[]>(() =>
    currentLocks.length ? currentLocks : DEFAULT_ROOM_LOCKS,
  );
  const [loading, setLoading] = useState(false);

  function toggleLock(key: string) {
    setLocks((prev) => prev.map((l) => (l.key === key ? { ...l, locked: !l.locked } : l)));
  }

  function updateNote(key: string, note: string) {
    setLocks((prev) => prev.map((l) => (l.key === key ? { ...l, note } : l)));
  }

  function handleSave() {
    setLoading(true);
    db.set((n) => {
      n.roomLocks = locks;
    });
    toast.success("Pengaturan kunci ruangan berhasil diperbarui!");
    setLoading(false);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="text-primary" size={24} /> Kunci Ruangan & Modul
          </h1>
          <p className="text-sm text-muted-foreground">
            Kelola akses ruangan untuk POV Owner Tenant. Ruangan yang dikunci tidak dapat dibuka dan
            menampilkan pesan kustom di atas card.
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
        {locks.map((room) => (
          <div
            key={room.key}
            className={`neu p-5 rounded-2xl border transition-all ${
              room.locked
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-border/50 hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    room.locked
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-emerald-500/20 text-emerald-500"
                  }`}
                >
                  {room.locked ? <Lock size={18} /> : <Unlock size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-base">{room.name}</h3>
                  <code className="text-[11px] text-muted-foreground font-mono">{room.key}</code>
                </div>
              </div>

              <button
                onClick={() => toggleLock(room.key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  room.locked ? "bg-amber-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    room.locked ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Keterangan Custom (POV Tenant):</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold ${
                    room.locked
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-emerald-500/20 text-emerald-500"
                  }`}
                >
                  {room.locked ? "Terkunci" : "Bebas Akses"}
                </span>
              </div>

              <input
                value={room.note}
                onChange={(e) => updateNote(room.key, e.target.value)}
                placeholder="misal: Segera hadir, Dalam perbaikan, dll."
                className="w-full rounded-xl neu-inset px-3 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
              />

              {room.locked && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-500 pt-1 font-medium">
                  <AlertTriangle size={13} />
                  <span>Card akan menampilkan badge: "{room.note || "Segera hadir"}"</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
