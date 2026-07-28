import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, ArrowUp, ArrowDown, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { currentTenant, db, uid, useDB } from "@/lib/store";
import { downloadCSV } from "./admin.tenants";

export const Route = createFileRoute("/app/stok")({ component: StokPage });

const UNITS = ["pcs", "gram", "kg", "liter", "ml", "pack", "box"];

function StokPage() {
  const t = currentTenant();
  const stock = useDB((d) =>
    t
      ? d.stock
          .filter((s) => s.tenantId === t.id)
          .slice()
          .reverse()
      : [],
  );
  const products = useDB((d) => (t ? d.products.filter((p) => p.tenantId === t.id) : []));
  const [type, setType] = useState<"in" | "out">("in");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState("pcs");
  const [note, setNote] = useState("");

  function submit() {
    if (!t) return;
    if (!productId) return toast.error("Pilih produk.");
    if (qty <= 0) return toast.error("Qty > 0.");
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const sisa = +(p.stock + (type === "in" ? qty : -qty)).toFixed(2);
    db.set((n) => {
      n.stock.push({
        id: uid("stk"),
        tenantId: t.id,
        productId,
        productName: p.name,
        type,
        qty,
        unit,
        note: (note ? note + " · " : "") + `Sisa: ${sisa} ${unit}`,
        createdAt: new Date().toISOString(),
      });
      const prod = n.products.find((x) => x.id === productId);
      if (prod) prod.stock = sisa;
    });
    toast.success(`Stok tercatat. Sisa akhir: ${sisa} ${unit}`);
    setQty(0);
    setNote("");
  }

  function exportProducts() {
    downloadCSV(
      "produk-stok.csv",
      products.map((p) => ({
        id: p.id,
        nama: p.name,
        stok: p.stock,
        harga: p.price,
        sku: p.sku ?? "",
      })),
    );
  }

  function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !t) return;
    const r = new FileReader();
    r.onload = () => {
      const text = r.result as string;
      const lines = text.split(/\r?\n/).slice(1).filter(Boolean);
      let updated = 0;
      db.set((n) => {
        for (const l of lines) {
          const [id, , stokStr] = l.split(",").map((s) => s.replace(/^"|"$/g, ""));
          const p = n.products.find((x) => x.id === id && x.tenantId === t.id);
          if (p && !isNaN(+stokStr)) {
            p.stock = +stokStr;
            updated++;
          }
        }
      });
      toast.success(`${updated} produk disinkron.`);
    };
    r.readAsText(f);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportProducts}
          className="rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground flex items-center gap-1"
        >
          <Download size={12} /> Export Produk
        </button>
        <label className="rounded-lg neu-sm px-3 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer">
          <Upload size={12} /> Import CSV
          <input type="file" accept=".csv" onChange={importCSV} className="hidden" />
        </label>
      </div>

      <div className="neu p-5 space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <Plus size={16} /> Catat Stok
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setType("in")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 ${type === "in" ? "bg-success text-success-foreground" : "neu-sm"}`}
          >
            <ArrowDown size={14} /> Masuk
          </button>
          <button
            onClick={() => setType("out")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 ${type === "out" ? "bg-destructive text-destructive-foreground" : "neu-sm"}`}
          >
            <ArrowUp size={14} /> Keluar
          </button>
        </div>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
        >
          <option value="">— pilih produk —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (stok: {p.stock})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            value={qty || ""}
            onChange={(e) => setQty(+e.target.value)}
            placeholder="Qty"
            className="flex-1 rounded-lg neu-inset px-3 py-2 text-sm"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-lg neu-inset px-3 py-2 text-sm"
          >
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan"
          className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
        />
        <button
          onClick={submit}
          className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Simpan
        </button>
      </div>

      <div className="neu p-4">
        <h2 className="font-bold text-sm mb-2">Stok Produk Aktif</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {products.map((p) => {
            const low = p.stock <= 5;
            const crit = p.stock <= 0;
            return (
              <div
                key={p.id}
                className={`rounded-xl p-3 border ${crit ? "bg-destructive/10 border-destructive/40" : low ? "bg-warning/10 border-warning/40" : "bg-metallic border-border/40"}`}
              >
                <div className="text-xs font-semibold truncate">{p.name}</div>
                <div
                  className={`text-lg font-bold ${crit ? "text-destructive" : low ? "text-warning" : "text-primary"}`}
                >
                  {p.stock}
                </div>
                {crit ? (
                  <div className="text-[10px] text-destructive font-bold">HABIS</div>
                ) : low ? (
                  <div className="text-[10px] text-warning font-bold">STOK MENIPIS</div>
                ) : (
                  <div className="text-[10px] text-muted-foreground">Aman</div>
                )}
              </div>
            );
          })}
          {products.length === 0 && (
            <div className="col-span-full text-center py-4 text-xs text-muted-foreground">
              Belum ada produk.
            </div>
          )}
        </div>
      </div>

      <div className="neu overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                {["Waktu", "Produk", "Tipe", "Qty", "Satuan", "Catatan & Sisa"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted-foreground">
                    Belum ada pergerakan.
                  </td>
                </tr>
              )}
              {stock.map((s) => (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2 font-semibold">{s.productName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.type === "in" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                    >
                      {s.type === "in" ? "Masuk" : "Keluar"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.qty}</td>
                  <td className="px-3 py-2 text-xs">{s.unit}</td>
                  <td className="px-3 py-2 text-xs">{s.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
