import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { currentTenant, formatIDR, useDB } from "@/lib/store";
import { downloadCSV } from "./admin.tenants";

export const Route = createFileRoute("/app/kasir/rekap")({ component: Rekapan });

function Rekapan() {
  const t = currentTenant();
  const txs = useDB((d) => (t ? d.transactions.filter((x) => x.tenantId === t.id) : []));
  const cash = useDB((d) => (t ? d.cash.filter((c) => c.tenantId === t.id) : []));
  const [period, setPeriod] = useState<"today" | "7" | "all" | "custom">("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const now = new Date();
    return txs.filter((x) => {
      const d = new Date(x.createdAt);
      if (period === "today") return d.toDateString() === now.toDateString();
      if (period === "7") return now.getTime() - d.getTime() < 7 * 864e5;
      if (period === "custom") {
        if (from && d < new Date(from)) return false;
        if (to && d > new Date(to + "T23:59:59")) return false;
        return true;
      }
      return true;
    });
  }, [txs, period, from, to]);

  const paid = filtered.filter((x) => x.status === "paid");
  const omzet = paid.reduce((a, b) => a + b.total, 0);
  const uangKeluar = cash.filter((c) => c.type === "out").reduce((a, b) => a + b.amount, 0);
  const saldo = omzet - uangKeluar;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(["today", "7", "all", "custom"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${period === p ? "bg-gradient-primary text-primary-foreground" : "neu-sm"}`}
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
              "rekap.csv",
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Omzet" value={formatIDR(omzet)} tone="text-primary" />
        <Card label="Uang Keluar" value={formatIDR(uangKeluar)} tone="text-destructive" />
        <Card label="Saldo Kas" value={formatIDR(saldo)} />
        <Card label="Jumlah Transaksi" value={String(filtered.length)} />
        <Card label="Void" value={String(voidCount)} tone="text-destructive" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="neu p-4">
          <h3 className="font-semibold mb-2">Metode Pembayaran</h3>
          {Object.entries(byMethod).length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada.</p>
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
            <p className="text-xs text-muted-foreground">Belum ada.</p>
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
        📌 Seluruh Uang Keluar dicatat dari menu Kas.
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
