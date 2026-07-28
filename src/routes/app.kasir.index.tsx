import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { currentTenant, currentUser, formatIDR, useDB } from "@/lib/store";
import {
  Coins,
  Wallet,
  ShoppingBag,
  Ban,
  Star,
  PackageX,
  HandCoins,
  TrendingUp,
  Receipt,
  ArrowDownCircle,
  QrCode,
  Landmark,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/app/kasir/")({
  component: KasirDashboard,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Pagi";
  if (h < 15) return "Siang";
  if (h < 18) return "Sore";
  return "Malam";
}

function KasirDashboard() {
  const me = currentUser();
  const t = currentTenant();

  // Cek apakah user adalah Owner/Admin
  const isOwner = me?.role === "owner" || me?.role === "super_admin";

  const products = useDB((d) => (t ? d.products.filter((p) => p.tenantId === t.id) : []));
  const txs = useDB((d) => (t ? d.transactions.filter((x) => x.tenantId === t.id) : []));
  const cash = useDB((d) => (t ? d.cash.filter((c) => c.tenantId === t.id) : []));

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Transaksi dibuat hari ini (termasuk piutang belum lunas — masuk Omset segera)
    const todayTx = txs.filter((x) => x.createdAt.slice(0, 10) === today);
    const salesToday = todayTx.filter((x) => x.status !== "void");
    // Omset kotor = seluruh penjualan (paid + unpaid) yang dibuat hari ini
    const omzet = salesToday.reduce((a, b) => a + b.total, 0);
    const count = salesToday.length;
    const voidCount = todayTx.filter((x) => x.status === "void").length;

    // HPP produk terjual hari ini (seluruh penjualan non-void, terlepas status lunas)
    let hpp = 0;
    let hppComplete = true;
    const missingSet = new Set<string>();
    for (const x of salesToday) {
      for (const i of x.items) {
        const p = products.find((z) => z.id === i.productId);
        const c = i.cost ?? p?.cost;
        if (c == null) {
          hppComplete = false;
          missingSet.add(i.productId);
        } else hpp += c * i.qty;
      }
    }
    const missingCost = missingSet.size;

    // Pengeluaran hari ini (kas out)
    const pengeluaranHariIni = cash
      .filter((c) => c.type === "out" && c.createdAt.slice(0, 10) === today)
      .reduce((a, b) => a + b.amount, 0);

    // Laba Kotor hari ini
    const labaKotor = omzet - hpp - pengeluaranHariIni;

    // Uang MASUK hari ini — berdasarkan pelunasan (paidAt) hari ini
    const paidReceivedToday = txs.filter(
      (x) => x.status === "paid" && x.paidAt && x.paidAt.slice(0, 10) === today,
    );
    const cashHariIni = paidReceivedToday
      .filter((x) => x.method === "cash")
      .reduce((a, b) => a + b.total, 0);
    const qrisHariIni = paidReceivedToday
      .filter((x) => x.method === "qris")
      .reduce((a, b) => a + b.total, 0);
    const transferHariIni = paidReceivedToday
      .filter((x) => x.method === "transfer")
      .reduce((a, b) => a + b.total, 0);

    // Saldo kas fisik (all-time laci) — hanya transaksi PAID cash yang menambah kas
    let saldoLaci = 0;
    let currentFill = 0;
    for (const c of cash) {
      if (c.type === "fill") {
        if (c.reset) {
          currentFill = c.amount;
          saldoLaci = currentFill;
        } else {
          currentFill += c.amount;
          saldoLaci += c.amount;
        }
      } else if (c.type === "in") saldoLaci += c.amount;
      else saldoLaci -= c.amount;
    }
    saldoLaci += txs
      .filter((x) => x.status === "paid" && x.method === "cash")
      .reduce((a, b) => a + b.total, 0);

    // Produk terlaris hari ini (semua penjualan non-void)
    const salesMap = new Map<string, number>();
    salesToday.forEach((x) =>
      x.items.forEach((i) => salesMap.set(i.name, (salesMap.get(i.name) ?? 0) + i.qty)),
    );
    const top = [...salesMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const lowStock = products.filter((p) => p.stock <= 5).length;
    const piutang = txs.filter((x) => x.status === "unpaid").reduce((a, b) => a + b.total, 0);

    return {
      omzet,
      hpp,
      hppComplete,
      missingCost,
      pengeluaranHariIni,
      labaKotor,
      cashHariIni,
      qrisHariIni,
      transferHariIni,
      saldoLaci,
      count,
      voidCount,
      lowStock,
      piutang,
      top: top ? `${top[0]} (${top[1]}x)` : "—",
    };
  }, [txs, products, cash]);

  if (me?.role === "member") {
    return <Navigate to="/app/kasir/pos" replace />;
  }

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="neu p-5">
        <div className="text-xs uppercase text-muted-foreground">
          {new Date().toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
        <h1 className="mt-1 text-2xl font-bold">
          Selamat {greeting()}, <span className="text-primary">{me?.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground">{t?.businessName}</p>
      </div>

      {/* HIGHLIGHT - Laba Bersih */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-glow to-primary p-6 text-primary-foreground shadow-elegant">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Sparkles size={140} />
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-90 font-semibold">
          <TrendingUp size={14} /> Estimasi Laba Kotor Hari Ini
        </div>
        {stats.hppComplete ? (
          <div className="mt-2 text-3xl sm:text-4xl font-black">{formatIDR(stats.labaKotor)}</div>
        ) : (
          <div className="mt-2">
            <div className="text-lg font-bold opacity-90">Belum bisa dihitung</div>
            <div className="text-xs opacity-80 mt-1">
              {stats.missingCost} produk terjual belum memiliki Harga Modal.
            </div>
            {/* Tombol hanya muncul jika Owner/Admin */}
            {isOwner && (
              <Link
                to="/app/kasir/manajemen"
                search={{ filter: "nocost" }}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/30 transition-all text-white shadow-sm"
              >
                Lengkapi Sekarang →
              </Link>
            )}
          </div>
        )}
        <div className="mt-2 text-[11px] opacity-80 italic">(Omset − HPP − Pengeluaran Harian)</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <MiniRow label="Omzet" value={formatIDR(stats.omzet)} />
          <MiniRow label="HPP" value={stats.hppComplete ? `-${formatIDR(stats.hpp)}` : "—"} />
          <MiniRow label="Pengeluaran" value={`-${formatIDR(stats.pengeluaranHariIni)}`} />
        </div>
      </div>

      {/* Ringkasan Finansial Hari Ini */}
      <div>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ringkasan Finansial Hari Ini
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat
            icon={Coins}
            label="Omzet Kotor"
            value={formatIDR(stats.omzet)}
            tone="text-primary"
          />
          <Stat
            icon={Receipt}
            label="HPP Produk Terjual"
            value={stats.hppComplete ? formatIDR(stats.hpp) : "—"}
            tone="text-warning"
          />
          <Stat
            icon={ArrowDownCircle}
            label="Pengeluaran Hari Ini"
            value={formatIDR(stats.pengeluaranHariIni)}
            tone="text-destructive"
          />
        </div>
      </div>

      {/* Breakdown Fisik Uang */}
      <div>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Breakdown Uang Masuk Hari Ini
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            icon={Wallet}
            label="Uang Cash di Laci"
            value={formatIDR(stats.saldoLaci)}
            tone="text-success"
            sub={`Tunai hari ini: ${formatIDR(stats.cashHariIni)}`}
          />
          <Stat
            icon={QrCode}
            label="Uang di QRIS"
            value={formatIDR(stats.qrisHariIni)}
            tone="text-primary"
          />
          <Stat
            icon={Landmark}
            label="Uang di Transfer Bank"
            value={formatIDR(stats.transferHariIni)}
            tone="text-primary"
          />
        </div>
      </div>

      {/* Operasional */}
      <div>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Operasional
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat icon={ShoppingBag} label="Transaksi" value={String(stats.count)} />
          <Stat icon={Star} label="Produk Terlaris" value={stats.top} />
          <Stat
            icon={Ban}
            label="Jumlah Void"
            value={String(stats.voidCount)}
            tone="text-destructive"
          />

          {/* Link Stok Hanya Aktif Jika Owner/Admin */}
          {isOwner ? (
            <Link to="/app/kasir/manajemen">
              <Stat
                icon={PackageX}
                label="Stok Hampir Habis"
                value={String(stats.lowStock)}
                tone="text-warning"
              />
            </Link>
          ) : (
            <Stat
              icon={PackageX}
              label="Stok Hampir Habis"
              value={String(stats.lowStock)}
              tone="text-warning"
            />
          )}

          <Stat
            icon={HandCoins}
            label="Piutang Aktif"
            value={formatIDR(stats.piutang)}
            tone="text-warning"
          />
        </div>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/15 px-2 py-1.5 backdrop-blur">
      <div className="text-[10px] uppercase opacity-80">{label}</div>
      <div className="text-xs font-bold truncate">{value}</div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-foreground",
  sub,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="neu p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold">
        <Icon size={14} /> {label}
      </div>
      <div className={`mt-2 text-xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
