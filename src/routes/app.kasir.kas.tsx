import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Filter } from "lucide-react";
import { currentTenant, db, formatIDR, uid, useDB } from "@/lib/store";

export const Route = createFileRoute("/app/kasir/kas")({ component: KasPage });

/** Returns YYYY-MM-DD in local timezone */
function localDateStr(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function downloadCashCSV(rows: { createdAt: string; type: string; amount: number; note?: string; reset?: boolean }[]) {
  const header = ["Waktu", "Tipe", "Nominal", "Catatan", "Reset Saldo"];
  const lines = rows.map((r) => [
    new Date(r.createdAt).toLocaleString("id-ID"),
    r.type === "fill" ? "Isi Kas" : r.type === "in" ? "Uang Masuk" : "Uang Keluar",
    r.amount,
    r.note ?? "",
    r.reset ? "Ya" : "",
  ]);
  const csv = [header, ...lines].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `riwayat-kas-${localDateStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function KasPage() {
  const t = currentTenant();
  const allEntries = useDB((d) =>
    t
      ? d.cash
          .filter((c) => c.tenantId === t.id)
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

  // Filter riwayat
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const saldo = useMemo(() => {
    // Gabungkan entri kas + transaksi tunai ke satu timeline, proses secara kronologis.
    // Ini memastikan bahwa ketika "Reset Saldo" dilakukan, transaksi tunai yang terjadi
    // SEBELUM reset tidak ikut terhitung — seolah uang di laci sudah diambil semua.
    type Event =
      | { time: number; kind: "entry"; entry: (typeof allEntries)[number] }
      | { time: number; kind: "tx"; total: number };

    const events: Event[] = [
      ...allEntries.map((c) => ({
        time: new Date(c.createdAt).getTime(),
        kind: "entry" as const,
        entry: c,
      })),
      ...txs.map((tx) => ({
        time: new Date(tx.createdAt).getTime(),
        kind: "tx" as const,
        total: tx.total,
      })),
    ].sort((a, b) => a.time - b.time);

    let s = 0;
    for (const ev of events) {
      if (ev.kind === "tx") {
        s += ev.total;
      } else {
        const c = ev.entry;
        if (c.type === "fill") {
          // Reset: buang semua akumulasi sebelumnya (termasuk transaksi tunai)
          if (c.reset) s = c.amount;
          else s += c.amount;
        } else if (c.type === "in") {
          s += c.amount;
        } else {
          s -= c.amount;
        }
      }
    }
    return s;
  }, [allEntries, txs]);

  const filteredEntries = useMemo(() => {
    if (!filterFrom && !filterTo) return allEntries;
    return allEntries.filter((c) => {
      const dStr = localDateStr(new Date(c.createdAt));
      if (filterFrom && dStr < filterFrom) return false;
      if (filterTo && dStr > filterTo) return false;
      return true;
    });
  }, [allEntries, filterFrom, filterTo]);

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
    toast.success(
      tab === "fill" && reset
        ? "Saldo laci berhasil direset dan diisi ulang."
        : "Kas dicatat.",
    );
    setAmount(0);
    setNote("");
    setReset(false);
  }

  return (
    <div className="space-y-4">
      <div className="neu p-4 space-y-1">
        <div className="text-xs text-muted-foreground">Saldo Kas Saat Ini</div>
        <div className="text-2xl font-bold text-primary">{formatIDR(saldo)}</div>
        <div className="text-[10px] text-muted-foreground">
          Akumulasi semua isi kas + uang masuk + penjualan tunai − uang keluar
        </div>
      </div>

      <div className="neu p-4 space-y-3">
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

        <div className="space-y-2">
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
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reset}
                  onChange={(e) => setReset(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <span className="font-semibold">Reset saldo laci</span>{" "}
                  — centang ini jika Anda sudah mengambil semua uang dari laci dan ingin mengisi
                  ulang dari awal (misalnya untuk modal kembalian besok).
                </span>
              </label>
              {reset && (
                <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
                  ⚠️ Saldo laci akan direset ke nominal yang Anda masukkan. Transaksi tunai
                  sebelum reset tidak akan ikut terhitung lagi. Riwayat tetap tersimpan.
                </div>
              )}
            </div>
          )}
          <button
            onClick={submit}
            className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Simpan
          </button>
        </div>
      </div>

      {/* Riwayat Kas */}
      <div className="neu p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm">Riwayat Kas</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                showFilter ? "bg-gradient-primary text-primary-foreground" : "neu-sm"
              }`}
            >
              <Filter size={12} /> Filter
            </button>
            <button
              onClick={() => downloadCashCSV(filteredEntries)}
              className="flex items-center gap-1 rounded-lg bg-gradient-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>Dari:</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="rounded-lg neu-inset px-2 py-1 text-xs"
            />
            <span>Sampai:</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="rounded-lg neu-inset px-2 py-1 text-xs"
            />
            {(filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterFrom(""); setFilterTo(""); }}
                className="text-xs text-muted-foreground underline"
              >
                Reset
              </button>
            )}
            <span className="text-muted-foreground">{filteredEntries.length} entri</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Waktu</th>
                <th className="px-3 py-2 text-left">Tipe</th>
                <th className="px-3 py-2 text-left">Nominal</th>
                <th className="px-3 py-2 text-left">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-muted-foreground">
                    Belum ada catatan kas{filterFrom || filterTo ? " pada periode ini" : ""}.
                  </td>
                </tr>
              )}
              {filteredEntries.map((c) => (
                <tr key={c.id} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    {new Date(c.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        c.type === "fill"
                          ? c.reset
                            ? "bg-warning/15 text-warning"
                            : "bg-primary/10 text-primary"
                          : c.type === "in"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {c.type === "fill"
                        ? c.reset
                          ? "Reset & Isi"
                          : "Isi Kas"
                        : c.type === "in"
                          ? "Masuk"
                          : "Keluar"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold">{formatIDR(c.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
