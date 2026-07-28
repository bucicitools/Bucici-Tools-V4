import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { db, useDB } from "@/lib/store";

export const Route = createFileRoute("/admin/tenants")({
  component: TenantsPage,
});

function toCSV(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TenantsPage() {
  const tenants = useDB((d) => d.tenants);
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.businessName.toLowerCase().includes(q.toLowerCase()) ||
          t.id.toLowerCase().includes(q.toLowerCase()),
      ),
    [tenants, q],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Daftar seluruh toko/tenant yang terdaftar.
          </p>
        </div>
        <button
          onClick={() =>
            downloadCSV(
              "tenants.csv",
              tenants.map((t) => ({
                business_name: t.businessName,
                owner_name: t.ownerName,
                tenant_id: t.id,
                license_code: t.licenseCode,
                created_at: t.createdAt,
                active: t.active,
              })),
            )
          }
          className="flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          <Download size={16} /> Download CSV
        </button>
      </div>

      <div className="neu-inset flex items-center gap-2 rounded-xl px-3 py-2">
        <Search size={16} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama toko atau tenant ID..."
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>

      <div className="neu overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                {["Nama Toko", "Owner", "Tenant ID", "Lisensi", "Terdaftar", "Status", "Aksi"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada tenant terdaftar.
                  </td>
                </tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} className="border-t border-border/50 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold">{t.businessName}</td>
                  <td className="px-4 py-3">{t.ownerName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.licenseCode}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(t.createdAt).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${t.active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                    >
                      {t.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        db.set((n) => {
                          const x = n.tenants.find((z) => z.id === t.id);
                          if (x) x.active = !x.active;
                        });
                        toast.success(
                          `Tenant ${t.businessName} ${t.active ? "dinonaktifkan" : "diaktifkan"}.`,
                        );
                      }}
                      className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
                    >
                      {t.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
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
