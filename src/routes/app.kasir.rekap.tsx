import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { currentTenant, formatIDR, useDB } from "@/lib/store";
import { downloadCSV } from "./admin.tenants";

export const Route = createFileRoute("/app/kasir/rekap")({ component: Rekapan });

/** Returns YYYY-MM-DD in local timezone */
function localDateStr(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function Rekapan() {
  const t = currentTenant();
  const txs = useDB((d) => (t ? d.transactions.filter((x) => x.tenantId === t.id) : []));
  const cash = useDB((d) => (t ? d.cash.filter((c) => c.tenantId === t.id) : []));
  const [period, setPeriod] = useState<"today" | "7" | "all" | "custom">("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const todayStr = localDateStr();

  // Filter transaksi berdasarkan periode — gunakan local timezone
  const filtered = useMemo(() => {
    const now = new Date();
    return txs.filter((x) => {
      const d = new Date(x.createdAt);
      const dStr = localDateStr(d);
      if (period === "today") return dStr === todayStr;
      if (period === "7") return now.getTime() - d.getTime() < 7 * 864e5;
      if (period === "custom") {
        if (from && dStr < from) return false;
        if (to && dStr > to) return false;
        return true;
      }
      return true; // "all"
    });
  }, [txs, period, from, to, todayStr]);

  // Filter kas berdasarkan periode juga (untuk Uang Keluar dalam periode)
  const filteredCash = useMemo(() => {
    const now = new Date();
    return cash.filter((c) => {
      const d = new Date(c.createdAt);
      const dStr = localDateStr(d);
      if (period === "today") return dStr === todayStr;
      if (period === "7") return now.getTime() - d.getTime() < 7 * 864e5;
      if (period === "custom") {
        if (from && dStr < from) return false;
        if (to && dStr > to) return false;
        return true;
      }
      return true;
    });
  }, [cash, period, from, to, todayStr]);

  const paid = filtered.filter((x) => x.status === "paid");
  const omzet = paid.reduce((a, b) => a + b.total, 0);

  // Uang keluar hanya dalam periode filter
  const uangKeluar = filteredCash
    .filter((c) => c.type === "out")
    .reduce((a, b) => a + b.amount, 0);

  // Saldo kas fisik (all-time laci) — selalu all-time karena ini saldo akumulatif
  const saldoKas = useMemo(() => {
    const sorted = [...cash].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let s = 0;
    for (const c of sorted) {
      if (c.type === "fill") {
        if (c.reset) s = c.amount;
        else s += c.amount;
      } else if (c.type === "in") s += c.amount;
      else s -= c.amount;
    }
    s += txs.filter((x) => x.status === "paid" && x.method === "cash").reduce((a, b) => a + b.total, 0);
    return s;
  }, [cash, txs]);

  const byMethod = paid.reduce<Record<string, number>>((acc, x) => {
    acc[x.method] = (acc[x.method] ?? 0) + x.total;
    return acc;
  }, {});
  const byCashier = paid.reduce<Record<string, { count: number; total: number }>>((acc, x) => {
    acc[x.cashierName] = acc[x.cashierName] ?? { count: 0, total: 0 };
    acc[x.cashierName].count++;
    acc[x.cashierName].total += x.total;
    return acc;
  }, {});
  const voidCount = filtered.filter((x) => x.status === "void").length;

  const periodLabel =
    period === "today" ? "Hari ini" : period === "7" ? "7 Hari Terakhir" : period === "all" ? "Semua Data" : `${from} s/d ${to}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(["today", "7", "all", "custom"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              period === p ? "bg-gradient-primary text-primary-foreground" : "neu-sm"
            }`}
          >
            {p === "today" ? "Hari ini" : p === "7" ? "7 Hari" : p === "all" ? "Semua" : "Custom"}
          </button>
        ))}
        {period === "custom" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg neu-inset px-2 py-1 text-xs"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg neu-inset px-2 py-1 text-xs"
            />
          </>
        )}
        <button
          onClick={() =>
            downloadCSV(
              `rekap-${period}.csv`,
              filtered.map((x) => ({
                id: x.id,
                tanggal: x.createdAt,
                total: x.total,
                metode: x.method,
                status: x.status,
                kasir: x.cashierName,
              })),
            )
          }
          className="ml-auto flex items-center gap-1 rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <Download size={12} /> CSV
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Menampilkan data: <b>{periodLabel}</b> · {filtered.length} transaksi
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="Omzet" value={formatIDR(omzet)} tone="text-primary" />
        <Card label={`Uang Keluar (${periodLabel})`} value={formatIDR(uangKeluar)} tone="text-destructive" />
        {/* Saldo Kas = akumulasi all-time saldo laci fisik */}
        <Card label="Saldo Kas Laci (all-time)" value={formatIDR(saldoKas)} tone="text-success" />
        <Card label="Transaksi" value={String(filtered.length)} />
        <Card label="Void" value={String(voidCount)} tone="text-destructive" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="neu p-4">
          <h3 className="font-semibold mb-2">Metode Pembayaran</h3>
          {Object.entries(byMethod).length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada transaksi dalam periode ini.</p>
          ) : (
            Object.entries(byMethod).map(([m, v]) => (
              <div key={m} className="flex justify-between text-sm py-1">
                <span>{m.toUpperCase()}</span>
                <b>{formatIDR(v)}</b>
              </div>
            ))
          )}
        </div>
        <div className="neu p-4">
          <h3 className="font-semibold mb-2">Kinerja Kasir</h3>
          {Object.entries(byCashier).length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada transaksi dalam periode ini.</p>
          ) : (
            Object.entries(byCashier).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm py-1">
                <span>{k}</span>
                <span className="text-xs">
                  {v.count} tx · <b>{formatIDR(v.total)}</b>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        📌 Omzet & Uang Keluar mengikuti filter periode. Saldo Kas Laci = akumulasi all-time (sama seperti di halaman Kas).
      </p>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="neu p-4">
      <div className="text-xs uppercase text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}
