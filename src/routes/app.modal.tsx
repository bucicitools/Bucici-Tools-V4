import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { currentTenant, db, formatIDR, uid, useDB } from "@/lib/store";
import { askGemini } from "@/lib/gemini";
import { parseNumeric, selectAllOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/modal")({ component: HitungModal });

// Bahan baku dinamis: harga beli untuk 'buyQty <unit>' → dipakai 'usage <unit>' per porsi.
// HPP bahan = harga * (usage / buyQty).
interface Ingredient {
  name: string;
  price: string; // harga beli total (Rp)
  buyQty: string; // kapasitas beli (mis. "1000" untuk 1000 gram)
  usage: string; // pemakaian per unit produk (mis. "0.25" atau "1/4")
  unit: string;
}
interface Packaging {
  name: string;
  price: string;
}

function HitungModal() {
  const t = currentTenant();
  const products = useDB((d) =>
    t ? d.products.filter((p) => p.tenantId === t.id && p.cost == null) : [],
  );
  const [name, setName] = useState("");
  const [ings, setIngs] = useState<Ingredient[]>([
    { name: "", price: "", buyQty: "", usage: "", unit: "gram" },
  ]);
  const [packs, setPacks] = useState<Packaging[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [rec, setRec] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState("40"); // string agar anti "07"

  const bahanCost = useMemo(
    () =>
      ings.reduce((sum, i) => {
        const price = parseNumeric(i.price);
        const buyQty = parseNumeric(i.buyQty);
        const usage = parseNumeric(i.usage);
        if (price <= 0 || buyQty <= 0 || usage <= 0) return sum;
        return sum + (price / buyQty) * usage;
      }, 0),
    [ings],
  );

  const packCost = useMemo(() => packs.reduce((s, p) => s + parseNumeric(p.price), 0), [packs]);
  const hpp = bahanCost + packCost;
  const margin = parseNumeric(targetMargin);
  const recommended =
    margin > 0 && margin < 100
      ? Math.round(hpp / (1 - margin / 100) / 100) * 100
      : Math.round((hpp * 1.4) / 100) * 100;

  function pull(id: string) {
    const p = products.find((x) => x.id === id);
    if (p) {
      setName(p.name);
      setProductId(id);
    }
  }

  async function askAI() {
    if (hpp <= 0) return toast.error("Isi komposisi bahan terlebih dahulu.");
    setLoading(true);
    try {
      const prompt = `Produk: "${name || "Produk"}".
HPP per unit: Rp${Math.round(hpp).toLocaleString("id-ID")} (bahan Rp${Math.round(bahanCost).toLocaleString("id-ID")} + kemasan Rp${Math.round(packCost).toLocaleString("id-ID")}).
Target margin: ${margin}%.

Buat tabel Markdown rekomendasi 3 strategi harga jual (Kompetitif / Standar / Premium) dengan kolom: Strategi | Harga Jual | Margin % | Alasan singkat. Harga bulat rapi (kelipatan 500/1000).`;
      const res = await askGemini(prompt);
      setRec(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!t) return;
    if (!name) return toast.error("Nama produk wajib.");
    const components = ings
      .filter((i) => i.name)
      .map((i) => ({
        name: i.name,
        unitPrice: parseNumeric(i.price) / Math.max(parseNumeric(i.buyQty), 1),
        qty: parseNumeric(i.usage),
        unit: i.unit,
      }));
    db.set((n) => {
      n.hpp.push({
        id: uid("hpp"),
        tenantId: t.id,
        productName: name,
        components,
        createdAt: new Date().toISOString(),
      });
      if (productId) {
        const p = n.products.find((x) => x.id === productId);
        if (p) p.cost = hpp;
      }
    });
    toast.success(productId ? "HPP tersimpan & harga modal produk diperbarui." : "HPP tersimpan.");
  }

  const inp = "mt-1 w-full rounded-lg neu-inset px-2 py-1.5 text-sm min-w-0";

  return (
    <div className="space-y-4">
      <div className="neu p-4 sm:p-5 space-y-3">
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <Sparkles /> Hitung Modal (HPP Murni)
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Kalkulasi biaya bahan + kemasan per unit. Dukung pecahan: <code>1/4</code>,{" "}
          <code>0.25</code>, <code>1 1/2</code>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Nama Produk</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={selectAllOnFocus}
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Pull dari Produk Belum Modal
            </span>
            <select value={productId} onChange={(e) => pull(e.target.value)} className={inp}>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">
            Bahan Baku (Dinamis) — dukung pecahan "1/4"
          </div>
          {ings.map((c, i) => (
            <div key={i} className="rounded-xl neu-sm p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Bahan #{i + 1}
                </span>
                <button
                  onClick={() => setIngs((p) => p.filter((_, j) => j !== i))}
                  className="text-destructive p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                    Nama Bahan Baku
                  </span>
                  <input
                    value={c.name}
                    onChange={(e) =>
                      setIngs((p) =>
                        p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="mis. Ayam, Tepung terigu"
                    className={inp}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                    Harga Beli (Rp)
                  </span>
                  <input
                    inputMode="decimal"
                    value={c.price}
                    onChange={(e) =>
                      setIngs((p) =>
                        p.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)),
                      )
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="25000"
                    className={inp}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                    Kuantitas / Berat Beli
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    value={c.buyQty}
                    onChange={(e) =>
                      setIngs((p) =>
                        p.map((x, j) => (j === i ? { ...x, buyQty: e.target.value } : x)),
                      )
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="1000 (kapasitas total)"
                    className={inp}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                    Penggunaan / Porsi
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    value={c.usage}
                    onChange={(e) =>
                      setIngs((p) =>
                        p.map((x, j) => (j === i ? { ...x, usage: e.target.value } : x)),
                      )
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="1/4  atau  0.25"
                    className={inp}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                    Satuan (basis hitungan)
                  </span>
                  <input
                    value={c.unit}
                    onChange={(e) =>
                      setIngs((p) =>
                        p.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                      )
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="gram / ekor / bungkus / ml"
                    className={inp}
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setIngs((p) => [...p, { name: "", price: "", buyQty: "", usage: "", unit: "gram" }])
            }
            className="text-xs rounded-lg neu-sm px-3 py-1.5 font-semibold flex items-center gap-1"
          >
            <Plus size={12} /> Tambah Bahan
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">
            Kemasan / Packaging (opsional)
          </div>
          {packs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
              <input
                value={p.name}
                onChange={(e) =>
                  setPacks((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                onFocus={selectAllOnFocus}
                placeholder="Nama kemasan (mis. Cup 12oz)"
                className={inp}
              />
              <input
                inputMode="decimal"
                value={p.price}
                onChange={(e) =>
                  setPacks((r) => r.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                }
                onFocus={selectAllOnFocus}
                placeholder="Harga/unit"
                className={inp}
              />
              <button
                onClick={() => setPacks((r) => r.filter((_, j) => j !== i))}
                className="text-destructive p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setPacks((r) => [...r, { name: "", price: "" }])}
            className="text-xs rounded-lg neu-sm px-3 py-1.5 font-semibold flex items-center gap-1"
          >
            <Plus size={12} /> Kemasan
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-metallic p-3">
            <div className="text-xs font-semibold text-muted-foreground">Biaya Bahan</div>
            <div className="text-lg font-bold text-primary break-all">{formatIDR(bahanCost)}</div>
          </div>
          <div className="rounded-xl bg-metallic p-3">
            <div className="text-xs font-semibold text-muted-foreground">Biaya Kemasan</div>
            <div className="text-lg font-bold text-primary break-all">{formatIDR(packCost)}</div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Target Margin (%)</span>
            <input
              inputMode="decimal"
              value={targetMargin}
              onChange={(e) => setTargetMargin(e.target.value)}
              onFocus={selectAllOnFocus}
              className={inp}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-metallic p-4">
            <div className="text-xs font-semibold text-muted-foreground">HPP Total per Unit</div>
            <div className="text-xl sm:text-2xl font-bold text-primary break-all">
              {formatIDR(hpp)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Bahan {formatIDR(bahanCost)} · Kemasan {formatIDR(packCost)}
            </div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-4">
            <div className="text-xs font-semibold text-muted-foreground">
              Rekomendasi Harga Jual ({margin}%)
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600 break-all">
              {formatIDR(recommended)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              HPP ÷ (1 − margin), pembulatan Rp100
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={save}
            className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Simpan HPP
          </button>
          <button
            onClick={askAI}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}{" "}
            Strategi Harga AI
          </button>
        </div>
      </div>

      {rec && (
        <div className="neu p-4 sm:p-5 overflow-x-auto">
          <h2 className="font-bold mb-2">Rekomendasi Strategi AI</h2>
          <pre className="whitespace-pre-wrap text-xs sm:text-sm font-sans">{rec}</pre>
        </div>
      )}
    </div>
  );
}
