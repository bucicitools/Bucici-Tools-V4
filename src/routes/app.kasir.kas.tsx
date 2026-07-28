import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { currentTenant, db, formatIDR, uid, useDB } from "@/lib/store";

export const Route = createFileRoute("/app/kasir/kas")({ component: KasPage });

function KasPage() {
  const t = currentTenant();
  const entries = useDB((d) =>
    t
      ? d.cash
          .filter((c) => c.tenantId === t.id)
          .slice()
          .reverse()
      : [],
  );
  const txs = useDB((d) =>
    t
      ? d.transactions.filter(
          (x) => x.tenantId === t.id && x.status === "paid" && x.method === "cash",
        )
      : [],
  );
  const [tab, setTab] = useState<"fill" | "in" | "out">("fill");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [reset, setReset] = useState(false);

  const saldo = useMemo(() => {
    let s = 0;
    for (const c of entries.slice().reverse()) {
      if (c.type === "fill") {
        if (c.reset) s = c.amount;
        else s += c.amount;
      } else if (c.type === "in") s += c.amount;
      else s -= c.amount;
    }
    s += txs.reduce((a, b) => a + b.total, 0);
    return s;
  }, [entries, txs]);

  function submit() {
    if (!t) return;
    if (amount <= 0) return toast.error("Nominal harus > 0.");
    if ((tab === "in" || tab === "out") && !note.trim()) return toast.error("Catatan wajib.");
    db.set((n) => {
      n.cash.push({
        id: uid("cash"),
        tenantId: t.id,
        type: tab,
        amount,
        note: note || undefined,
        reset: tab === "fill" ? reset : undefined,
        createdAt: new Date().toISOString(),
      });
    });
    toast.success("Kas dicatat.");
    setAmount(0);
    setNote("");
    setReset(false);
  }

  return (
    <div className="space-y-4">
      <div className="neu p-5">
        <div className="text-xs uppercase text-muted-foreground font-semibold">
          Saldo Kas Saat Ini
        </div>
        <div className="mt-1 text-3xl font-bold text-primary">{formatIDR(saldo)}</div>
      </div>

      <div className="flex neu-inset rounded-xl p-1">
        {(["fill", "in", "out"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${tab === k ? "bg-gradient-primary text-primary-foreground" : ""}`}
          >
            {k === "fill" ? "Isi Kas" : k === "in" ? "Uang Masuk" : "Uang Keluar"}
          </button>
        ))}
      </div>

      <div className="neu p-4 space-y-3">
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(+e.target.value)}
          placeholder="Nominal"
          className="w-full rounded-lg neu-inset px-3 py-2"
        />
        {tab !== "fill" && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (wajib)"
            className="w-full rounded-lg neu-inset px-3 py-2"
          />
        )}
        {tab === "fill" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />{" "}
            Reset saldo kas (overwrite)
          </label>
        )}
        <button
          onClick={submit}
          className="rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Simpan
        </button>
      </div>

      <div className="neu overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Waktu</th>
              <th className="px-3 py-2 text-left">Tipe</th>
              <th className="px-3 py-2 text-right">Nominal</th>
              <th className="px-3 py-2 text-left">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-muted-foreground">
                  Belum ada catatan kas.
                </td>
              </tr>
            )}
            {entries.map((c) => (
              <tr key={c.id} className="border-t border-border/50">
                <td className="px-3 py-2 text-xs">
                  {new Date(c.createdAt).toLocaleString("id-ID")}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.type === "out" ? "bg-destructive/15 text-destructive" : c.type === "in" ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}
                  >
                    {c.type === "fill" ? "Isi" : c.type === "in" ? "Masuk" : "Keluar"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-semibold">{formatIDR(c.amount)}</td>
                <td className="px-3 py-2 text-xs">{c.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
