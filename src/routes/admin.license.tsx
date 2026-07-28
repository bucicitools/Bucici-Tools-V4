import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { db, uid, useDB } from "@/lib/store";
import { downloadCSV } from "./admin.tenants";

export const Route = createFileRoute("/admin/license")({
  component: LicensePage,
});

function LicensePage() {
  const licenses = useDB((d) => d.licenses);
  const [qty, setQty] = useState(10);
  const [batch, setBatch] = useState("");
  const [filter, setFilter] = useState<"all" | "left">("all");

  const total = licenses.length;
  const used = licenses.filter((l) => l.used).length;
  const left = total - used;

  const filtered = useMemo(
    () => (filter === "left" ? licenses.filter((l) => !l.used) : licenses),
    [licenses, filter],
  );

  function generate() {
    if (qty < 1 || qty > 500) return toast.error("Jumlah antara 1-500.");
    const codes: string[] = [];
    db.set((n) => {
      for (let i = 0; i < qty; i++) {
        const code = "BUCICI-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        codes.push(code);
        n.licenses.push({
          id: uid("lic"),
          code,
          batch: batch || undefined,
          used: false,
          createdAt: new Date().toISOString(),
        });
      }
    });
    toast.success(`${qty} lisensi berhasil dibuat.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">License Manager</h1>
        <p className="text-sm text-muted-foreground">Generate & kelola kode lisensi BUCICI-XXXX.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Lisensi" value={total} />
        <StatCard label="Lisensi Terpakai" value={used} tone="warn" />
        <StatCard label="Lisensi Tersisa" value={left} tone="ok" />
      </div>

      <div className="neu p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Sparkles size={16} /> Generate Lisensi
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="sm:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">Jumlah (1-500)</span>
            <input
              type="number"
              min={1}
              max={500}
              value={qty}
              onChange={(e) => setQty(+e.target.value)}
              className="mt-1 w-full rounded-lg neu-inset px-3 py-2"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Nama Batch (opsional)
            </span>
            <input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="mis. Promo-Juli"
              className="mt-1 w-full rounded-lg neu-inset px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={generate}
          className="mt-4 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          Generate
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "left")}
          className="rounded-lg neu-inset px-3 py-2 text-sm"
        >
          <option value="all">Semua</option>
          <option value="left">Tersisa</option>
        </select>
        <button
          onClick={() =>
            downloadCSV(
              "licenses.csv",
              licenses.map((l) => ({
                code: l.code,
                batch: l.batch ?? "",
                used: l.used,
                used_by: l.usedBy ?? "",
                created_at: l.createdAt,
              })),
            )
          }
          className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          <Download size={16} /> Download CSV
        </button>
      </div>

      <div className="neu overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                {["Kode", "Batch", "Status", "Dipakai Oleh", "Dibuat"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada lisensi.
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="px-4 py-3 font-mono text-xs">{l.code}</td>
                  <td className="px-4 py-3 text-xs">{l.batch ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${l.used ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}
                    >
                      {l.used ? "Terpakai" : "Tersedia"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{l.usedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(l.createdAt).toLocaleDateString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const c = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-primary";
  return (
    <div className="neu p-5">
      <div className="text-xs uppercase font-semibold text-muted-foreground">{label}</div>
      <div className={`mt-2 text-4xl font-bold ${c}`}>{value}</div>
    </div>
  );
}
