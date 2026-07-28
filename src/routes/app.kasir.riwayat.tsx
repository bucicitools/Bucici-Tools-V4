import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, CreditCard } from "lucide-react";
import { currentTenant, db, formatIDR, uid, useDB, type Transaction } from "@/lib/store";
import { ReceiptModal } from "./app.kasir.pos";

export const Route = createFileRoute("/app/kasir/riwayat")({ component: Riwayat });

function Riwayat() {
  const t = currentTenant();
  const txs = useDB((d) => (t ? d.transactions.filter((x) => x.tenantId === t.id) : []));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Transaction["status"]>("all");
  const [view, setView] = useState<Transaction | null>(null);
  const [payFor, setPayFor] = useState<Transaction | null>(null);
  const [voidFor, setVoidFor] = useState<Transaction | null>(null);

  const filtered = useMemo(
    () =>
      txs.filter(
        (x) =>
          (status === "all" || x.status === status) &&
          (x.id.includes(q) || (x.customer ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [txs, q, status],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari transaksi/pelanggan..."
          className="flex-1 min-w-[180px] rounded-lg neu-inset px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg neu-inset px-2 py-2 text-sm"
        >
          <option value="all">Semua Status</option>
          <option value="paid">Lunas</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="neu overflow-hidden">
        <div className="w-full overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                {["Waktu Pesan", "Waktu Lunas", "ID", "Pelanggan", "Total", "Status", "Aksi"].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 text-left whitespace-nowrap">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground">
                    Belum ada transaksi.
                  </td>
                </tr>
              )}
              {filtered.map((x) => (
                <tr
                  key={x.id}
                  className="border-t border-border/50 cursor-pointer hover:bg-secondary/30"
                  onClick={() => setView(x)}
                >
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(x.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {x.paidAt ? (
                      new Date(x.paidAt).toLocaleString("id-ID")
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    {x.id.slice(-8)}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{x.customer ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">
                    {formatIDR(x.total)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${x.status === "paid" ? "bg-success/15 text-success" : x.status === "unpaid" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}`}
                    >
                      {x.status === "paid"
                        ? "Lunas"
                        : x.status === "unpaid"
                          ? "Belum Bayar"
                          : "Void"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {x.status === "unpaid" && (
                      <button
                        onClick={() => setPayFor(x)}
                        className="rounded-lg bg-gradient-primary px-3 py-1 text-xs text-primary-foreground"
                      >
                        Bayar Sekarang
                      </button>
                    )}
                    {x.status === "paid" && (
                      <button
                        onClick={() => setVoidFor(x)}
                        className="rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {view && <ReceiptModal tx={view} onClose={() => setView(null)} />}
      {payFor && <PayNowModal tx={payFor} onClose={() => setPayFor(null)} />}
      {voidFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setVoidFor(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="neu bg-background rounded-2xl max-w-sm w-full p-5 space-y-3"
          >
            <h3 className="font-bold text-lg">Void Transaksi?</h3>
            <p className="text-sm">
              Void transaksi <b className="font-mono">{voidFor.id.slice(-8)}</b> sebesar{" "}
              <b>{formatIDR(voidFor.total)}</b>? Stok produk akan dikembalikan.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setVoidFor(null)}
                className="flex-1 rounded-xl neu-sm py-2.5 text-sm font-semibold"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const target = voidFor;
                  db.set((n) => {
                    const txn = n.transactions.find((z) => z.id === target.id);
                    if (!txn || txn.status === "void") return;
                    txn.status = "void";
                    for (const i of txn.items) {
                      const p = n.products.find((pr) => pr.id === i.productId);
                      if (p) {
                        p.stock = +(p.stock + i.qty).toFixed(2);
                        n.stock.push({
                          id: uid("stk"),
                          tenantId: txn.tenantId,
                          productId: p.id,
                          productName: p.name,
                          type: "in",
                          qty: i.qty,
                          unit: "pcs",
                          note: `Void ${txn.id.slice(-6)} · Sisa: ${p.stock}`,
                          createdAt: new Date().toISOString(),
                        });
                      }
                    }
                  });
                  toast.success("Void — stok dikembalikan.");
                  setVoidFor(null);
                }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayNowModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [method, setMethod] = useState<"cash" | "qris" | "transfer">("cash");
  const [paid, setPaid] = useState<number>(tx.total);
  const change = method === "cash" ? Math.max(0, paid - tx.total) : 0;

  function submit() {
    if (method === "cash" && paid < tx.total) return toast.error("Uang bayar kurang dari total.");
    db.set((n) => {
      const t = n.transactions.find((z) => z.id === tx.id);
      if (!t) return;
      // UPDATE — do not delete. Piutang menjadi Lunas tanpa menambah Omzet baru.
      t.status = "paid";
      t.method = method;
      t.paid = method === "cash" ? paid : tx.total;
      t.change = change;
      t.paidAt = new Date().toISOString();
    });
    toast.success("Pelunasan berhasil. Piutang berkurang, kas bertambah.");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neu bg-background rounded-2xl max-w-sm w-full p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Bayar Piutang</h3>
          <button onClick={onClose} className="text-muted-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="rounded-xl bg-metallic p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pelanggan</span>
            <span>{tx.customer ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Waktu Pesan</span>
            <span className="text-xs">{new Date(tx.createdAt).toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between font-bold text-primary border-t border-border/50 pt-1">
            <span>Tagihan</span>
            <span>{formatIDR(tx.total)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Metode</div>
          <div className="flex gap-1">
            {(["cash", "qris", "transfer"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${method === m ? "bg-primary text-primary-foreground" : "neu-sm"}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {method === "cash" && (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Uang Diterima</span>
              <input
                type="number"
                value={paid || ""}
                onChange={(e) => setPaid(+e.target.value)}
                className="mt-1 w-full rounded-lg neu-inset px-3 py-2 text-sm"
              />
            </label>
            {change > 0 && (
              <div className="text-xs text-success">
                Kembalian: <b>{formatIDR(change)}</b>
              </div>
            )}
          </>
        )}
        <button
          onClick={submit}
          className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-bold text-primary-foreground flex items-center justify-center gap-2"
        >
          <CreditCard size={16} /> Konfirmasi Pelunasan
        </button>
      </div>
    </div>
  );
}
