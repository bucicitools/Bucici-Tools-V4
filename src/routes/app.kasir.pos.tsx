import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Search,
  Grid2X2,
  List,
  Plus,
  Minus,
  Trash2,
  X,
  CreditCard,
  Clock,
  Printer,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  currentTenant,
  currentUser,
  formatIDR,
  uid,
  useDB,
  db,
  type CartItem,
  type Transaction,
  type Product,
} from "@/lib/store";
import { printBluetooth, type PrintLine } from "@/lib/bluetoothPrint";

export const Route = createFileRoute("/app/kasir/pos")({
  component: POSPage,
});

const CASH_BUTTONS = [5000, 10000, 20000, 50000, 100000];

// Helper untuk menghapus leading zero pada input number
const parseNumberInput = (val: string): number => {
  const cleaned = val.replace(/^0+(?=\d)/, "");
  return cleaned === "" ? 0 : Number(cleaned);
};

function POSPage() {
  const t = currentTenant();
  const me = currentUser();
  const products = useDB((d) => (t ? d.products.filter((p) => p.tenantId === t.id) : []));
  const cats = useDB((d) => (t ? d.categories.filter((c) => c.tenantId === t.id) : []));
  const [view, setView] = useState<"card" | "list">("card");
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discType, setDiscType] = useState<"rp" | "pct">("rp");
  const [taxOn, setTaxOn] = useState(() => {
    // Auto-aktifkan pajak jika ada default pajak tersimpan
    const saved = Number(localStorage.getItem("bucici_tax_rate") || "0");
    return saved > 0;
  });
  const [taxPct, setTaxPct] = useState(() => {
    // Baca pajak default dari pengaturan
    const saved = Number(localStorage.getItem("bucici_tax_rate") || "0");
    return saved > 0 ? saved : 11;
  });
  const [payMode, setPayMode] = useState<"now" | "later">("now");
  const [method, setMethod] = useState<"cash" | "qris" | "transfer">("cash");
  const [paidAmt, setPaidAmt] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [showReceipt, setShowReceipt] = useState<Transaction | null>(null);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (catFilter === "all" ||
            p.categoryId === catFilter ||
            cats.find((c) => c.id === catFilter)?.name === p.categoryId ||
            cats.find((c) => c.id === p.categoryId)?.id === catFilter) &&
          p.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [products, q, catFilter, cats],
  );

  const subtotal = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const discountAmt = discType === "pct" ? subtotal * (discount / 100) : discount;
  const afterDisc = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxOn ? afterDisc * (taxPct / 100) : 0;
  const total = afterDisc + taxAmt;
  const change = payMode === "now" && method === "cash" ? Math.max(0, paidAmt - total) : 0;

  function add(p: Product) {
    setCart((c) => {
      const ex = c.find((i) => i.productId === p.id);
      if (ex) return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { productId: p.id, name: p.name, price: p.price, qty: 1, cost: p.cost }];
    });
  }
  function inc(id: string, d: number) {
    setCart((c) =>
      c.map((i) =>
        i.productId === id ? { ...i, qty: Math.max(0.01, +(i.qty + d).toFixed(2)) } : i,
      ),
    );
  }
  function setQty(id: string, q: number) {
    setCart((c) => c.map((i) => (i.productId === id ? { ...i, qty: q } : i)));
  }
  function rem(id: string) {
    setCart((c) => c.filter((i) => i.productId !== id));
  }

  function pay() {
    if (!t || !me) return;
    if (cart.length === 0) return toast.error("Keranjang kosong.");
    if (payMode === "now" && method === "cash" && paidAmt < total)
      return toast.error("Uang bayar kurang.");
    const tx: Transaction = {
      id: uid("tx"),
      tenantId: t.id,
      cashierId: me.id,
      cashierName: me.name,
      items: cart,
      subtotal,
      discount: discountAmt,
      discountType: discType,
      tax: taxAmt,
      taxPct: taxOn ? taxPct : 0,
      total,
      paid: payMode === "later" ? 0 : payMode === "now" && method === "cash" ? paidAmt : total,
      change,
      method: payMode === "later" ? "credit" : method,
      status: payMode === "later" ? "unpaid" : "paid",
      customer: customer || undefined,
      note: note || undefined,
      dueDate: payMode === "later" ? dueDate || undefined : undefined,
      createdAt: new Date().toISOString(),
      paidAt: payMode === "now" ? new Date().toISOString() : undefined,
    };
    db.set((n) => {
      n.transactions.unshift(tx);
      for (const i of cart) {
        const p = n.products.find((x) => x.id === i.productId);
        if (p) {
          p.stock = +(p.stock - i.qty).toFixed(2);
          n.stock.push({
            id: uid("stk"),
            tenantId: t.id,
            productId: p.id,
            productName: p.name,
            type: "out",
            qty: i.qty,
            unit: "pcs",
            note: `Penjualan ${tx.id.slice(-6)} · Sisa: ${p.stock}`,
            createdAt: tx.createdAt,
          });
        }
      }
    });
    toast.success(payMode === "later" ? "Piutang tersimpan." : "Transaksi berhasil.");
    setShowReceipt(tx);
    setCart([]);
    setCustomer("");
    setNote("");
    setDiscount(0);
    setPaidAmt(0);
    setCreditNote("");
    setDueDate("");
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("bucici_prefill_cart");
    if (raw) {
      try {
        const p = JSON.parse(raw) as { items: CartItem[]; customer?: string; note?: string };
        setCart(p.items);
        if (p.customer) setCustomer(p.customer);
        if (p.note) setNote(p.note);
        sessionStorage.removeItem("bucici_prefill_cart");
        toast.info("Keranjang dimuat dari transaksi piutang.");
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="neu-inset flex flex-1 min-w-[200px] items-center gap-2 rounded-xl px-3 py-2">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari produk..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-xl neu-inset px-3 py-2 text-sm"
          >
            <option value="all">Semua Kategori</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex neu-inset rounded-xl p-1">
            <button
              onClick={() => setView("card")}
              className={`p-2 rounded-lg ${view === "card" ? "bg-gradient-primary text-primary-foreground" : ""}`}
            >
              <Grid2X2 size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 rounded-lg ${view === "list" ? "bg-gradient-primary text-primary-foreground" : ""}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {view === "card" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="neu p-3 text-left hover:-translate-y-0.5 transition disabled:opacity-40"
                disabled={p.stock <= 0}
              >
                <div className="aspect-square w-full rounded-lg bg-metallic mb-2 flex items-center justify-center overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-3xl">🛒</span>
                  )}
                </div>
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="text-xs text-primary font-bold">{formatIDR(p.price)}</div>
                <div
                  className={`text-[10px] ${p.stock <= 5 ? "text-warning" : "text-muted-foreground"}`}
                >
                  Stok: {p.stock}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-10 text-muted-foreground text-sm">
                Belum ada produk. Tambah di Manajemen → Produk.
              </div>
            )}
          </div>
        ) : (
          <div className="neu overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border/50 hover:bg-secondary/30">
                    <td className="px-3 py-2 font-semibold">{p.name}</td>
                    <td className="px-3 py-2 text-primary">{formatIDR(p.price)}</td>
                    <td className="px-3 py-2 text-xs">Stok: {p.stock}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => add(p)}
                        className="rounded-lg bg-gradient-primary px-3 py-1 text-primary-foreground text-xs"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="neu p-4 space-y-3 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Keranjang</h2>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-destructive">
              Kosongkan
            </button>
          )}
        </div>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Keranjang kosong</p>
        ) : (
          <div className="space-y-2">
            {cart.map((i) => (
              <div
                key={i.productId}
                className="rounded-xl bg-secondary/50 p-2 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatIDR(i.price)} × {i.qty} = <b>{formatIDR(i.price * i.qty)}</b>
                  </div>
                </div>
                <button onClick={() => inc(i.productId, -1)} className="rounded-lg neu-sm p-1">
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  step="0.01"
                  value={i.qty}
                  onChange={(e) => setQty(i.productId, parseNumberInput(e.target.value))}
                  className="w-14 text-center rounded neu-inset py-0.5 text-xs"
                />
                <button onClick={() => inc(i.productId, 1)} className="rounded-lg neu-sm p-1">
                  <Plus size={12} />
                </button>
                <button onClick={() => rem(i.productId)} className="text-destructive p-1">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t border-border/50 pt-3">
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Nama pelanggan (opsional)"
            className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan / no. meja"
            className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
          />

          <div className="flex gap-2 items-center">
            <span className="text-xs w-20">Diskon</span>
            <input
              type="number"
              value={discount === 0 ? "" : discount}
              onChange={(e) => setDiscount(parseNumberInput(e.target.value))}
              className="flex-1 rounded-lg neu-inset px-2 py-1 text-sm"
              placeholder="0"
            />
            <div className="flex neu-inset rounded-lg p-0.5">
              <button
                onClick={() => setDiscType("rp")}
                className={`px-2 py-0.5 text-xs rounded ${discType === "rp" ? "bg-primary text-primary-foreground" : ""}`}
              >
                Rp
              </button>
              <button
                onClick={() => setDiscType("pct")}
                className={`px-2 py-0.5 text-xs rounded ${discType === "pct" ? "bg-primary text-primary-foreground" : ""}`}
              >
                %
              </button>
            </div>
          </div>

          {/* Pajak — nilai default dari Pengaturan, bisa diubah per transaksi */}
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} />
              Pajak (%)
            </label>
            {taxOn && (
              <input
                type="number"
                value={taxPct === 0 ? "" : taxPct}
                onChange={(e) => setTaxPct(parseNumberInput(e.target.value))}
                className="w-16 rounded-lg neu-inset px-2 py-1 text-sm"
                placeholder="0"
              />
            )}
            {taxOn && (
              <span className="text-[10px] text-muted-foreground">default dari Pengaturan</span>
            )}
          </div>

          <div className="rounded-xl bg-metallic p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatIDR(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Diskon</span>
                <span>-{formatIDR(discountAmt)}</span>
              </div>
            )}
            {taxAmt > 0 && (
              <div className="flex justify-between">
                <span>Pajak {taxPct}%</span>
                <span>{formatIDR(taxAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-primary border-t border-border/50 pt-1">
              <span>Total</span>
              <span>{formatIDR(total)}</span>
            </div>
          </div>

          <div className="flex neu-inset rounded-xl p-1">
            <button
              onClick={() => setPayMode("now")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${payMode === "now" ? "bg-gradient-primary text-primary-foreground" : ""}`}
            >
              Bayar Sekarang
            </button>
            <button
              onClick={() => setPayMode("later")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${payMode === "later" ? "bg-gradient-primary text-primary-foreground" : ""}`}
            >
              Bayar Nanti
            </button>
          </div>

          {payMode === "now" ? (
            <>
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
              {method === "cash" && (
                <>
                  <input
                    type="number"
                    value={paidAmt === 0 ? "" : paidAmt}
                    onChange={(e) => setPaidAmt(parseNumberInput(e.target.value))}
                    placeholder="Uang diterima"
                    className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-5 gap-1">
                    {CASH_BUTTONS.map((v) => (
                      <button
                        key={v}
                        onClick={() => setPaidAmt((p) => p + v)}
                        className="rounded-lg neu-sm text-[10px] py-1 font-semibold"
                      >
                        {v / 1000}k
                      </button>
                    ))}
                  </div>
                  {paidAmt > 0 && change > 0 && (
                    <div className="text-xs text-success">
                      Kembalian: <b>{formatIDR(change)}</b>
                    </div>
                  )}
                </>
              )}
              <button
                onClick={pay}
                className="w-full rounded-xl bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-elegant flex items-center justify-center gap-2"
              >
                <CreditCard size={16} /> Bayar {formatIDR(total)}
              </button>
            </>
          ) : (
            <>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
              />
              <input
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                placeholder="Catatan piutang"
                className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
              />
              <button
                onClick={pay}
                className="w-full rounded-xl bg-warning py-3 text-sm font-bold text-warning-foreground shadow-elegant flex items-center justify-center gap-2"
              >
                <Clock size={16} /> Simpan Piutang
              </button>
            </>
          )}
        </div>
      </div>

      {showReceipt && <ReceiptModal tx={showReceipt} onClose={() => setShowReceipt(null)} />}
    </div>
  );
}

export function ReceiptModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const t = currentTenant();
  const settings = useDB((d) => (t ? d.receipts[t.id] : undefined));

  function whatsapp() {
    const lines = [
      `*${settings?.header ?? t?.businessName}*`,
      `Transaksi: ${tx.id}`,
      `Waktu: ${new Date(tx.createdAt).toLocaleString("id-ID")}`,
      `---`,
      ...tx.items.map(
        (i) => `${i.name} ${i.qty}x @${formatIDR(i.price)} = ${formatIDR(i.qty * i.price)}`,
      ),
      `---`,
      `Subtotal: ${formatIDR(tx.subtotal)}`,
      tx.discount ? `Diskon: -${formatIDR(tx.discount)}` : "",
      tx.tax ? `Pajak: ${formatIDR(tx.tax)}` : "",
      `*TOTAL: ${formatIDR(tx.total)}*`,
      `Metode: ${tx.method.toUpperCase()} · Status: ${tx.status}`,
      settings?.footer ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  }

  async function btPrint() {
    const lines: PrintLine[] = [];
    lines.push({
      text: settings?.header ?? t?.businessName ?? "BUCICI",
      align: "center",
      bold: true,
      size: "large",
    });
    if (settings?.address) lines.push({ text: settings.address, align: "center" });
    if (settings?.phone) lines.push({ text: settings.phone, align: "center" });
    lines.push({ divider: true, text: "" });
    lines.push({ text: `No: ${tx.id.slice(-10)}` });
    lines.push({ text: `Pesan: ${new Date(tx.createdAt).toLocaleString("id-ID")}` });
    if (tx.paidAt) lines.push({ text: `Lunas: ${new Date(tx.paidAt).toLocaleString("id-ID")}` });
    lines.push({ text: `Kasir: ${tx.cashierName}` });
    if (tx.customer) lines.push({ text: `Plgn: ${tx.customer}` });
    lines.push({ divider: true, text: "" });
    for (const i of tx.items) {
      lines.push({ text: i.name, bold: true });
      lines.push({
        cols: [`${i.qty} x ${formatIDR(i.price)}`, formatIDR(i.qty * i.price)],
        text: "",
      });
    }
    lines.push({ divider: true, text: "" });
    lines.push({ cols: ["Subtotal", formatIDR(tx.subtotal)], text: "" });
    if (tx.discount > 0) lines.push({ cols: ["Diskon", `-${formatIDR(tx.discount)}`], text: "" });
    if (tx.tax > 0) lines.push({ cols: [`Pajak ${tx.taxPct}%`, formatIDR(tx.tax)], text: "" });
    lines.push({ cols: ["TOTAL", formatIDR(tx.total)], text: "", bold: true, size: "large" });
    if (tx.paid > 0)
      lines.push({ cols: [`Bayar (${tx.method.toUpperCase()})`, formatIDR(tx.paid)], text: "" });
    if (tx.change > 0) lines.push({ cols: ["Kembali", formatIDR(tx.change)], text: "" });
    lines.push({ divider: true, text: "" });
    lines.push({ text: settings?.footer ?? "Terima kasih", align: "center" });
    try {
      toast.loading("Menghubungkan ke printer Bluetooth...", { id: "bt" });
      await printBluetooth(lines, 32);
      toast.success("Struk terkirim ke printer.", { id: "bt" });
    } catch (e) {
      toast.error((e as Error).message || "Gagal mencetak.", { id: "bt" });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center p-3 border-b">
          <span className="font-bold text-sm">Struk</span>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="p-4 font-mono text-xs text-black space-y-1">
          <div className="text-center font-bold text-sm">{settings?.header ?? t?.businessName}</div>
          {settings?.address && <div className="text-center text-[10px]">{settings.address}</div>}
          {settings?.phone && <div className="text-center text-[10px]">{settings.phone}</div>}
          <div className="border-t border-dashed my-2" />
          <div>No: {tx.id}</div>
          <div>{new Date(tx.createdAt).toLocaleString("id-ID")}</div>
          <div>Kasir: {tx.cashierName}</div>
          {tx.customer && <div>Plgn: {tx.customer}</div>}
          <div className="border-t border-dashed my-2" />
          {tx.items.map((i) => (
            <div key={i.productId}>
              <div>{i.name}</div>
              <div className="flex justify-between">
                <span>
                  {i.qty} x {formatIDR(i.price)}
                </span>
                <span>{formatIDR(i.qty * i.price)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatIDR(tx.subtotal)}</span>
          </div>
          {tx.discount > 0 && (
            <div className="flex justify-between">
              <span>Diskon</span>
              <span>-{formatIDR(tx.discount)}</span>
            </div>
          )}
          {tx.tax > 0 && (
            <div className="flex justify-between">
              <span>Pajak {tx.taxPct}%</span>
              <span>{formatIDR(tx.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm my-1">
            <span>TOTAL</span>
            <span>{formatIDR(tx.total)}</span>
          </div>
          {tx.paid > 0 && (
            <div className="flex justify-between">
              <span>Bayar ({tx.method.toUpperCase()})</span>
              <span>{formatIDR(tx.paid)}</span>
            </div>
          )}
          {tx.change > 0 && (
            <div className="flex justify-between">
              <span>Kembali</span>
              <span>{formatIDR(tx.change)}</span>
            </div>
          )}
          <div className="border-t border-dashed my-2" />
          <div className="text-center text-[10px] whitespace-pre-wrap">
            {settings?.footer ?? "Terima kasih atas kunjungan Anda!"}
          </div>
        </div>
        <div className="p-3 border-t bg-gray-50 flex gap-2">
          <button
            onClick={btPrint}
            className="flex-1 bg-black text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
          >
            <Printer size={14} /> Cetak
          </button>
          <button
            onClick={whatsapp}
            className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
          >
            <MessageCircle size={14} /> Kirim WA
          </button>
        </div>
      </div>
    </div>
  );
}
