import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Package,
  Users,
  Shield,
  Tag,
  ChevronDown,
  Check,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  Layers,
  AlertCircle,
  TrendingDown,
  X,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  currentTenant,
  currentUser,
  db,
  formatIDR,
  uid,
  useDB,
  type Product,
  type User,
  type TenantRole,
} from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

type ManajemenSearch = {
  filter?: string;
};

export const Route = createFileRoute("/app/kasir/manajemen")({
  validateSearch: (search: Record<string, unknown>): ManajemenSearch => ({
    filter: typeof search.filter === "string" ? search.filter : undefined,
  }),
  component: Manajemen,
});

const PERMISSIONS = [
  { key: "pos", label: "POS" },
  { key: "rekap", label: "Rekapan" },
  { key: "kas", label: "Kas" },
  { key: "manajemen.produk", label: "Manajemen Produk" },
  { key: "manajemen.user", label: "Manajemen Pengguna" },
  { key: "manajemen.role", label: "Manajemen Role" },
  { key: "riwayat", label: "Riwayat" },
  { key: "struk", label: "Pengaturan Struk" },
  { key: "ai", label: "AI-sisten" },
  { key: "stok", label: "Ruang Stok" },
  { key: "pemasaran", label: "Ruang Pemasaran" },
  { key: "modal", label: "Hitung Modal" },
];

const parseNumberInput = (val: string): number => {
  const cleaned = val.replace(/^0+(?=\d)/, "");
  return cleaned === "" ? 0 : Number(cleaned);
};

function Manajemen() {
  const me = currentUser();
  const isOwner = me?.role === "owner" || me?.role === "super_admin";
  const [tab, setTab] = useState<"produk" | "pengguna" | "role">("produk");
  const tabs = isOwner
    ? [
        { k: "produk", i: Package, l: "Produk" },
        { k: "pengguna", i: Users, l: "Pengguna" },
        { k: "role", i: Shield, l: "Role" },
      ]
    : [{ k: "produk", i: Package, l: "Produk" }];
  return (
    <div className="space-y-4">
      <div className="flex neu-inset rounded-xl p-1">
        {tabs.map(({ k, i: Icon, l }) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${tab === k ? "bg-gradient-primary text-primary-foreground" : ""}`}
          >
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>
      {tab === "produk" && <ProdukTab />}
      {isOwner && tab === "pengguna" && <PenggunaTab />}
      {isOwner && tab === "role" && <RoleTab />}
    </div>
  );
}

function ProdukTab() {
  const t = currentTenant();
  const me = currentUser();
  const search = Route.useSearch();

  const products = useDB((d) =>
    t ? d.products.filter((p) => !p.tenantId || p.tenantId === t.id) : [],
  );
  const cats = useDB((d) =>
    t ? d.categories.filter((c) => !c.tenantId || c.tenantId === t.id) : [],
  );
  const storeCats = useDB((d) =>
    t ? d.categories.filter((c) => !c.tenantId || c.tenantId === t.id) : [],
  );

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>(() => search.filter || "all");

  useEffect(() => {
    if (search.filter) {
      setFilter(search.filter);
    }
  }, [search.filter]);

  const [showForm, setShowForm] = useState<Product | "new" | null>(null);
  const [showCat, setShowCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [confirmDelProduct, setConfirmDelProduct] = useState<Product | null>(null);

  const allCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const c of cats) {
      if (c.name) map.set(c.id || c.name, { id: c.id || c.name, name: c.name });
    }
    for (const c of storeCats) {
      if (c.name) map.set(c.id || c.name, { id: c.id || c.name, name: c.name });
    }
    return Array.from(map.values());
  }, [cats, storeCats]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (q.trim()) {
        const lowerQ = q.toLowerCase();
        const matchName = p.name.toLowerCase().includes(lowerQ);
        const matchSku = p.sku ? p.sku.toLowerCase().includes(lowerQ) : false;
        const catObj = p.categoryId
          ? allCategories.find(
              (c) => c.id === p.categoryId || c.name.toLowerCase() === p.categoryId!.toLowerCase(),
            )
          : null;
        const matchCat = catObj ? catObj.name.toLowerCase().includes(lowerQ) : false;
        if (!matchName && !matchSku && !matchCat) return false;
      }

      if (!filter || filter === "all") return true;

      if (filter === "nocost") {
        return p.cost == null || p.cost === 0 || Number.isNaN(p.cost);
      }

      if (filter === "low") {
        return p.stock <= 5;
      }

      if (filter === "nocat") {
        return !p.categoryId;
      }

      if (filter.startsWith("cat:")) {
        const target = filter.slice(4);
        if (!p.categoryId) return false;

        if (p.categoryId === target) return true;

        const catObj = allCategories.find(
          (c) => c.id === target || c.name.toLowerCase() === target.toLowerCase(),
        );

        if (catObj) {
          const catIdLower = p.categoryId.toLowerCase();
          return p.categoryId === catObj.id || catIdLower === catObj.name.toLowerCase();
        }

        return p.categoryId.toLowerCase() === target.toLowerCase();
      }

      return true;
    });
  }, [products, q, filter, allCategories]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const noCostCount = useMemo(() => {
    return products.filter((p) => p.cost == null || p.cost === 0 || Number.isNaN(p.cost)).length;
  }, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.stock <= 5).length;
  }, [products]);

  const getFilterLabel = (f: string) => {
    if (f === "all") return "Semua Produk";
    if (f === "nocost") return "Belum Ada Modal";
    if (f === "low") return "Stok Tipis (≤ 5)";
    if (f === "nocat") return "Tanpa Kategori";
    if (f.startsWith("cat:")) {
      const catId = f.slice(4);
      const catObj = allCategories.find((c) => c.id === catId || c.name === catId);
      return catObj ? `Kategori: ${catObj.name}` : "Kategori Terpilih";
    }
    return "Filter Produk";
  };

  return (
    <div className="space-y-3">
      {/* Top Bar Actions & Custom Dropdown */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowForm("new")}
          className="rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={14} /> Tambah Produk
        </button>
        <button
          type="button"
          onClick={() => setShowCat(true)}
          className="rounded-lg neu-sm px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:bg-accent transition-colors"
        >
          <Plus size={14} /> Kategori
        </button>

        {/* Vector Search Input */}
        <div className="relative flex-1 min-w-[160px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari produk, SKU, kategori..."
            className="w-full rounded-lg neu-inset pl-8 pr-7 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Professional Custom App Filter Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all ${
              filter !== "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50"
            }`}
          >
            <SlidersHorizontal
              size={14}
              className={filter !== "all" ? "text-primary" : "text-muted-foreground"}
            />
            <span className="max-w-[120px] truncate">{getFilterLabel(filter)}</span>
            {filter !== "all" && <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />}
            <ChevronDown
              size={14}
              className={`text-muted-foreground transition-transform duration-200 ${
                isFilterOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isFilterOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsFilterOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-border bg-popover p-2 shadow-xl">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status & Kondisi
                </div>
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setIsFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "all"
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Layers size={14} className="text-muted-foreground" />
                      Semua Produk
                    </span>
                    {filter === "all" ? (
                      <Check size={14} className="text-primary" />
                    ) : (
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                        {products.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFilter("nocost");
                      setIsFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "nocost"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-amber-500" />
                      Belum Ada Modal
                    </span>
                    {noCostCount > 0 && (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full">
                        {noCostCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFilter("low");
                      setIsFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "low"
                        ? "bg-red-500/15 text-red-600 dark:text-red-400 font-semibold"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TrendingDown size={14} className="text-red-500" />
                      Stok Tipis (≤ 5)
                    </span>
                    {lowStockCount > 0 && (
                      <span className="text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-500/20 px-1.5 py-0.5 rounded-full">
                        {lowStockCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFilter("nocat");
                      setIsFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "nocat"
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Tag size={14} className="text-muted-foreground" />
                      Tanpa Kategori
                    </span>
                    {filter === "nocat" && <Check size={14} className="text-primary" />}
                  </button>
                </div>

                {allCategories.length > 0 && (
                  <>
                    <div className="mt-2 pt-2 border-t border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Kategori Produk
                    </div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {allCategories.map((c) => {
                        const isSelected = filter === `cat:${c.id}`;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFilter(`cat:${c.id}`);
                              setIsFilterOpen(false);
                            }}
                            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              isSelected
                                ? "bg-primary/10 text-primary font-semibold"
                                : "hover:bg-accent text-foreground"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <Tag size={14} className="text-primary shrink-0" />
                              <span className="truncate">{c.name}</span>
                            </span>
                            {isSelected && <Check size={14} className="text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Filter Chips (App Horizontal Scroll) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
            filter === "all"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-secondary/80 text-secondary-foreground hover:bg-secondary"
          }`}
        >
          <Layers size={12} /> Semua
        </button>

        <button
          type="button"
          onClick={() => setFilter("nocost")}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
            filter === "nocost"
              ? "bg-amber-500 text-white shadow-xs"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
          }`}
        >
          <AlertCircle size={12} />
          <span>Belum Modal</span>
          {noCostCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold ${
                filter === "nocost"
                  ? "bg-black/20 text-white"
                  : "bg-amber-500/20 text-amber-800 dark:text-amber-200"
              }`}
            >
              {noCostCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setFilter("low")}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
            filter === "low"
              ? "bg-red-500 text-white shadow-xs"
              : "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20"
          }`}
        >
          <TrendingDown size={12} />
          <span>Stok Tipis</span>
          {lowStockCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold ${
                filter === "low"
                  ? "bg-black/20 text-white"
                  : "bg-red-500/20 text-red-800 dark:text-red-200"
              }`}
            >
              {lowStockCount}
            </span>
          )}
        </button>

        {allCategories.map((c) => {
          const isSelected = filter === `cat:${c.id}`;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(isSelected ? "all" : `cat:${c.id}`)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary/80 text-secondary-foreground hover:bg-secondary"
              }`}
            >
              <Tag size={12} /> {c.name}
            </button>
          );
        })}
      </div>

      {/* Active Filter Notice Banners */}
      {filter === "nocost" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={16} className="shrink-0 text-amber-500" />
            <span>
              Menampilkan <strong>{filtered.length}</strong> produk tanpa harga modal.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-500/30 transition-colors shrink-0"
          >
            <RotateCcw size={12} /> Tampilkan Semua
          </button>
        </div>
      )}

      {filter === "low" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-500/10 border border-red-500/25 p-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2 font-medium">
            <TrendingDown size={16} className="shrink-0 text-red-500" />
            <span>
              Menampilkan <strong>{filtered.length}</strong> produk dengan stok hampir habis (stok ≤
              5).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="flex items-center gap-1 rounded-lg bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-900 dark:text-red-200 hover:bg-red-500/30 transition-colors shrink-0"
          >
            <RotateCcw size={12} /> Reset Filter
          </button>
        </div>
      )}

      {filter.startsWith("cat:") && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 border border-primary/20 p-2.5 text-xs text-primary">
          <div className="flex items-center gap-2 font-medium">
            <Tag size={16} className="shrink-0 text-primary" />
            <span>
              Filter Kategori:{" "}
              <strong>
                {allCategories.find((c) => c.id === filter.slice(4))?.name || filter.slice(4)}
              </strong>{" "}
              ({filtered.length} produk)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="flex items-center gap-1 rounded-lg bg-primary/20 px-2.5 py-1 text-[11px] font-semibold hover:bg-primary/30 transition-colors"
          >
            <X size={12} /> Reset Filter
          </button>
        </div>
      )}

      <div className="neu overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              {["Nama", "Harga", "Modal", "Stok", "Kategori", "Aksi"].map((h) => (
                <th key={h} className="px-3 py-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-muted-foreground">
                  Tidak ada produk.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2">{formatIDR(p.price)}</td>
                <td className="px-3 py-2 text-xs">
                  {p.cost != null ? (
                    formatIDR(p.cost)
                  ) : (
                    <span className="text-warning">Belum diisi</span>
                  )}
                </td>
                <td className={`px-3 py-2 ${p.stock <= 5 ? "text-warning font-bold" : ""}`}>
                  {p.stock}
                </td>
                <td className="px-3 py-2 text-xs">
                  {cats.find((c) => c.id === p.categoryId || c.name === p.categoryId)?.name ??
                    p.categoryId ??
                    "—"}
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <button onClick={() => setShowForm(p)} className="p-1 rounded neu-sm">
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setConfirmDelProduct(p)}
                    className="p-1 rounded bg-destructive/10 text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="neu p-6 text-center text-xs text-muted-foreground">Tidak ada produk.</div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="neu p-3 flex gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {cats.find((c) => c.id === p.categoryId || c.name === p.categoryId)?.name ??
                  p.categoryId ??
                  "Tanpa kategori"}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                <div>
                  <div className="text-muted-foreground">Harga</div>
                  <div className="font-semibold">{formatIDR(p.price)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Modal</div>
                  <div className={p.cost != null ? "font-semibold" : "text-warning"}>
                    {p.cost != null ? formatIDR(p.cost) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Stok</div>
                  <div className={`font-semibold ${p.stock <= 5 ? "text-warning" : ""}`}>
                    {p.stock}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={() => setShowForm(p)}
                aria-label="Edit"
                className="p-2 rounded-lg neu-sm"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setConfirmDelProduct(p)}
                aria-label="Hapus"
                className="p-2 rounded-lg bg-destructive/10 text-destructive"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && t && (
        <ProductForm
          ownerMode={me?.role === "owner" || me?.role === "super_admin"}
          initial={showForm === "new" ? null : showForm}
          tenantId={t.id}
          cats={cats}
          onClose={() => setShowForm(null)}
        />
      )}
      {showCat && t && (
        <Modal onClose={() => setShowCat(false)} title="Kategori">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="flex-1 rounded-lg neu-inset px-3 py-2 text-sm"
                placeholder="Nama kategori"
              />
              <button
                onClick={async () => {
                  if (!newCat.trim()) return;
                  const newCatId = uid("cat");
                  await supabase.from("categories").upsert({
                    id: newCatId,
                    tenant_id: t.id,
                    name: newCat.trim(),
                  });
                  db.set((n) => {
                    n.categories.push({ id: newCatId, tenantId: t.id, name: newCat.trim() });
                  });
                  setNewCat("");
                  toast.success("Kategori ditambahkan.");
                }}
                className="rounded-lg bg-gradient-primary px-3 text-primary-foreground text-sm font-semibold"
              >
                + Tambah
              </button>
            </div>
            <div className="space-y-1">
              {cats.map((c) => (
                <div
                  key={c.id}
                  className="flex justify-between items-center rounded-lg bg-secondary/50 px-3 py-2 text-sm"
                >
                  <span>{c.name}</span>
                  <button
                    onClick={async () => {
                      await supabase.from("categories").delete().eq("id", c.id);
                      db.set((n) => {
                        n.categories = n.categories.filter((x) => x.id !== c.id);
                      });
                      toast.success("Kategori dihapus.");
                    }}
                    className="text-destructive p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {confirmDelProduct && (
        <Modal onClose={() => setConfirmDelProduct(null)} title="Hapus Produk?">
          <div className="space-y-3">
            <p className="text-sm">
              Apakah Anda yakin ingin menghapus produk <b>{confirmDelProduct.name}</b>? Tindakan ini
              tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelProduct(null)}
                className="flex-1 rounded-xl neu-sm py-2.5 text-sm font-semibold"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const id = confirmDelProduct.id;
                  db.set((n) => {
                    n.products = n.products.filter((x) => x.id !== id);
                  });
                  toast.success("Produk dihapus.");
                  setConfirmDelProduct(null);
                }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategorySelector({
  value,
  onChange,
  tenantId,
  passedCats,
}: {
  value: string;
  onChange: (val: string) => void;
  tenantId: string;
  passedCats: { id: string; name: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inlineNewCat, setInlineNewCat] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const dbCats = useDB((d) => d.categories.filter((c) => !c.tenantId || c.tenantId === tenantId));

  const allCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const c of passedCats) {
      if (c.name) {
        const key = c.id || c.name;
        map.set(key, { id: c.id || c.name, name: c.name });
      }
    }
    for (const c of dbCats) {
      if (c.name) {
        const key = c.id || c.name;
        map.set(key, { id: c.id || c.name, name: c.name });
      }
    }
    return Array.from(map.values());
  }, [passedCats, dbCats]);

  const selectedCatObj = useMemo(() => {
    if (!value) return null;
    return (
      allCategories.find((c) => c.id === value || c.name.toLowerCase() === value.toLowerCase()) || {
        id: value,
        name: value,
      }
    );
  }, [value, allCategories]);

  async function handleAddInlineCategory() {
    const trimmed = inlineNewCat.trim();
    if (!trimmed) return;
    const newCatId = uid("cat");
    try {
      await supabase.from("categories").upsert({
        id: newCatId,
        tenant_id: tenantId,
        name: trimmed,
      });
    } catch (e) {
      console.warn("Category insert warning:", e);
    }
    db.set((n) => {
      n.categories.push({ id: newCatId, tenantId, name: trimmed });
    });
    onChange(newCatId);
    setInlineNewCat("");
    setIsAdding(false);
    toast.success(`Kategori "${trimmed}" ditambahkan.`);
  }

  return (
    <div className="space-y-1.5 relative">
      <label className="block text-xs font-semibold text-muted-foreground">Kategori Produk</label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm hover:border-primary/50 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <Tag size={14} className="text-primary shrink-0" />
            {selectedCatObj ? (
              <span className="text-foreground">{selectedCatObj.name}</span>
            ) : (
              <span className="text-muted-foreground">— Tanpa Kategori —</span>
            )}
          </span>
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

            <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-xl">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    !value
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <span>— Tanpa Kategori —</span>
                  {!value && <Check size={14} className="text-primary" />}
                </button>

                {allCategories.map((c) => {
                  const isSelected =
                    value === c.id || (selectedCatObj && selectedCatObj.id === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      <span>{c.name}</span>
                      {isSelected && <Check size={14} className="text-primary" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 pt-2 border-t border-border">
                {isAdding ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nama kategori baru..."
                      value={inlineNewCat}
                      onChange={(e) => setInlineNewCat(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddInlineCategory();
                        }
                      }}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddInlineCategory()}
                      className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="w-full flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={12} /> + Buat Kategori Baru
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => onChange("")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              !value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Tanpa Kategori
          </button>
          {allCategories.map((c) => {
            const isSelected = value === c.id || (selectedCatObj && selectedCatObj.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductForm({
  ownerMode,
  initial,
  tenantId,
  cats,
  onClose,
}: {
  ownerMode: boolean;
  initial: Product | null;
  tenantId: string;
  cats: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [stock, setStock] = useState(initial?.stock ?? 0);
  const [cost, setCost] = useState<number | "">(initial?.cost ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");

  const [catValue, setCatValue] = useState<string>(initial?.categoryId ?? "");
  const [image, setImage] = useState<string | undefined>(initial?.image);

  async function save() {
    if (!name.trim()) return toast.error("Nama wajib.");

    const prodId = initial ? initial.id : uid("prd");
    const chosenCat = catValue || undefined;

    try {
      await supabase.from("products").upsert({
        id: prodId,
        tenant_id: tenantId,
        name: name.trim(),
        price,
        cost_price: cost === "" ? null : Number(cost),
        stock,
        barcode: sku || null,
        category: chosenCat || null,
        image_url: image || null,
      });
    } catch (err) {
      console.warn("Product direct upsert warning:", err);
    }

    db.set((n) => {
      if (initial) {
        const p = n.products.find((x) => x.id === initial.id);
        if (p)
          Object.assign(p, {
            name: name.trim(),
            price,
            stock,
            cost: cost === "" ? undefined : Number(cost),
            sku: sku || undefined,
            categoryId: chosenCat,
            image,
          });
      } else {
        n.products.push({
          id: prodId,
          tenantId,
          name: name.trim(),
          price,
          stock,
          cost: cost === "" ? undefined : Number(cost),
          sku: sku || undefined,
          categoryId: chosenCat,
          image,
        });
      }
    });
    toast.success("Produk disimpan.");
    onClose();
  }

  return (
    <Modal onClose={onClose} title={initial ? "Edit Produk" : "Tambah Produk"}>
      <div className="space-y-3">
        <Input label="Nama" value={name} onChange={setName} />
        <Input
          label="Harga Jual"
          type="number"
          value={price === 0 ? "" : price}
          onChange={(v) => setPrice(parseNumberInput(v))}
        />
        <Input
          label="Stok"
          type="number"
          value={stock === 0 ? "" : stock}
          onChange={(v) => setStock(parseNumberInput(v))}
        />
        {ownerMode && (
          <Input
            label="Harga Modal (opsional)"
            type="number"
            value={cost === "" ? "" : cost}
            onChange={(v) => setCost(v === "" ? "" : parseNumberInput(v))}
          />
        )}
        <Input label="SKU (opsional)" value={sku} onChange={setSku} />

        <CategorySelector
          value={catValue}
          onChange={setCatValue}
          tenantId={tenantId}
          passedCats={cats}
        />

        <div>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Gambar</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setImage(r.result as string);
              r.readAsDataURL(f);
            }}
            className="w-full text-xs"
          />
          {image && <img src={image} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover" />}
        </div>

        <button
          onClick={() => void save()}
          className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Simpan
        </button>
      </div>
    </Modal>
  );
}

function PenggunaTab() {
  const t = currentTenant();

  // Filter menampilkan seluruh pengguna milik tenant ini
  const users = useDB((d) =>
    t ? d.users.filter((u) => u.tenantId === t.id || t.ownerId === u.id) : [],
  );

  const roles = useDB((d) => (t ? d.roles.filter((r) => r.tenantId === t.id) : []));
  const [showForm, setShowForm] = useState<User | "new" | null>(null);
  const [confirmDelUser, setConfirmDelUser] = useState<User | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "" });

  function open(u: User | "new") {
    setShowForm(u);
    setForm(
      u === "new"
        ? { name: "", email: "", password: "", roleId: roles[0]?.id ?? "" }
        : { name: u.name, email: u.email, password: u.password, roleId: u.roleId ?? "" },
    );
  }

  async function handleDeleteUser(userToDelete: User) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        await fetch("/api/delete-member", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ memberId: userToDelete.id }),
        });
      }
    } catch (err) {
      console.warn("Delete member API call warning:", err);
    }

    try {
      await supabase.from("profiles").delete().eq("id", userToDelete.id);
    } catch {
      // ignore
    }

    db.set((n) => {
      n.users = n.users.filter((x) => x.id !== userToDelete.id);
    });

    toast.success(`Anggota "${userToDelete.name}" berhasil dihapus.`);
    setConfirmDelUser(null);
  }

  async function save() {
    if (!t) return;
    if (!form.name || !form.email || !form.password) return toast.error("Lengkapi form.");
    if (!form.roleId) return toast.error("Pilih role terlebih dahulu (buat di tab Role).");

    setLoading(true);

    if (showForm === "new") {
      try {
        let newUserId: string | null = null;

        // Step 1: Try server API endpoint (uses service-role key to bypass RLS)
        // If the API fails with a "tenant not found" error, we silently fall through
        // to the client-side fallback — which uses t.id from local store directly.
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (token) {
            const res = await fetch("/api/create-member", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                name: form.name,
                email: form.email,
                password: form.password,
                roleId: form.roleId,
              }),
            });

            const resText = await res.text();
            if (resText.trim().startsWith("{")) {
              const j = JSON.parse(resText) as { ok?: boolean; userId?: string; error?: string };
              if (res.ok && j.ok && j.userId) {
                newUserId = j.userId;
              } else if (j.error) {
                // Only re-throw errors that are NOT about missing tenant/store config.
                // Tenant-related errors fall through to the signUp fallback which uses
                // t.id from the local store directly — no API needed.
                const errMsg = j.error.toLowerCase();
                const isTenantError =
                  errMsg.includes("toko") ||
                  errMsg.includes("tenant") ||
                  errMsg.includes("terkonfigurasi") ||
                  errMsg.includes("belum ditemukan");
                if (!isTenantError) {
                  throw new Error(j.error);
                }
                // Tenant error: log and fall through to fallback
                console.warn("[create-member] Tenant not found via API, falling back to signUp:", j.error);
              }
            }
          }
        } catch (apiErr) {
          const msg = (apiErr as Error).message ?? "";
          // Don't re-throw tenant/store errors — fallback handles them
          const isTenantErr =
            msg.toLowerCase().includes("toko") ||
            msg.toLowerCase().includes("tenant") ||
            msg.toLowerCase().includes("terkonfigurasi") ||
            msg.toLowerCase().includes("belum ditemukan");
          // Also don't re-throw network/parse errors (fetch fails, HTML responses, etc.)
          const isNetworkErr = msg.includes("Unexpected token") || msg.includes("fetch");
          if (!isTenantErr && !isNetworkErr) {
            throw apiErr;
          }
          console.warn("[create-member] API error (will use fallback):", msg);
        }

        // Step 2: Fallback — create member via client-side signUp using t.id directly
        if (!newUserId) {
          const { createClient } = await import("@supabase/supabase-js");
          const tempClient = createClient(
            import.meta.env.VITE_SUPABASE_URL || "https://knufqsnamewqsboeitba.supabase.co",
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
              "sb_publishable_nCM8f5v151h1ZaobsxVJSA_-ITWXZvv",
            { auth: { persistSession: false, autoRefreshToken: false } },
          );

          const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
              data: {
                name: form.name,
                tenant_id: t.id,
                role_id: form.roleId,
                role: "member",
              },
            },
          });

          if (signUpErr || !signUpData?.user) {
            throw new Error(signUpErr?.message || "Gagal membuat akun anggota.");
          }

          newUserId = signUpData.user.id;

          // Upsert profile row with tenant_id & role_id using owner's supabase client
          await supabase.from("profiles").upsert({
            id: newUserId,
            name: form.name,
            email: form.email,
            tenant_id: t.id,
            role_id: form.roleId,
          });

          // Assign member role
          await supabase
            .from("user_roles")
            .upsert({ user_id: newUserId, role: "member" }, { onConflict: "user_id,role" });
        }

        // Add to local store immediately so it shows without reload
        db.set((n) => {
          // Avoid duplicate if already in store
          if (!n.users.some((u) => u.id === newUserId)) {
            n.users.push({
              id: newUserId!,
              name: form.name,
              email: form.email,
              password: form.password,
              role: "member",
              roleId: form.roleId,
              tenantId: t.id,
              createdAt: new Date().toISOString(),
            });
          }
        });

        toast.success("Anggota berhasil ditambahkan!");
        setShowForm(null);
      } catch (e) {
        toast.error((e as Error).message || "Gagal menyimpan.");
      } finally {
        setLoading(false);
      }
    } else if (showForm) {
      try {
        await supabase
          .from("profiles")
          .update({
            name: form.name,
            role_id: form.roleId,
          })
          .eq("id", showForm.id);

        db.set((n) => {
          const u = n.users.find((x) => x.id === (showForm as User).id);
          if (u) Object.assign(u, form);
        });
        toast.success("Anggota diperbarui.");
        setShowForm(null);
      } catch (e) {
        toast.error((e as Error).message || "Gagal memperbarui.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => open("new")}
        className="rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground flex items-center gap-1"
      >
        <Plus size={12} /> Anggota
      </button>
      <div className="neu overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              {["Nama", "Email", "Role", "Aksi"].map((h) => (
                <th key={h} className="px-3 py-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-muted-foreground">
                  Belum ada anggota.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-semibold flex items-center gap-2">
                  {u.name}
                  {u.role === "owner" && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      OWNER
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{u.email}</td>
                <td className="px-3 py-2 text-xs">
                  {u.role === "owner"
                    ? "Pemilik Toko"
                    : (roles.find((r) => r.id === u.roleId)?.name ?? "—")}
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <button onClick={() => open(u)} className="p-1 rounded neu-sm">
                    <Pencil size={12} />
                  </button>
                  {u.role !== "owner" && (
                    <button
                      onClick={() => setConfirmDelUser(u)}
                      className="p-1 rounded bg-destructive/10 text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(null)} title={showForm === "new" ? "Tambah Anggota" : "Edit Anggota"}>
          <div className="space-y-3">
            <Input label="Nama" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              disabled={showForm !== "new"}
            />
            {showForm === "new" && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-lg neu-inset px-3 py-2 text-sm pr-8"
                    placeholder="Min. 6 karakter"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Role</label>
              {roles.length === 0 ? (
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-xs text-warning flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Buat role dulu di tab <b>Role</b> sebelum menambah anggota.
                </div>
              ) : (
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                  className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
                >
                  <option value="">— Pilih Role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={() => void save()}
              disabled={loading}
              className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelUser && (
        <Modal onClose={() => setConfirmDelUser(null)} title="Hapus Anggota?">
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>
                Hapus anggota <b>{confirmDelUser.name}</b>? Akun mereka akan dihapus permanen dan
                tidak bisa login lagi.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelUser(null)}
                className="flex-1 rounded-xl neu-sm py-2.5 text-sm font-semibold"
              >
                Batal
              </button>
              <button
                onClick={() => void handleDeleteUser(confirmDelUser)}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoleTab() {
  const t = currentTenant();
  const roles = useDB((d) => (t ? d.roles.filter((r) => r.tenantId === t.id) : []));
  const [showForm, setShowForm] = useState<TenantRole | "new" | null>(null);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>([]);

  function open(r: TenantRole | "new") {
    setShowForm(r);
    if (r === "new") {
      setName("");
      setPerms([]);
    } else {
      setName(r.name);
      setPerms(r.permissions);
    }
  }

  function save() {
    if (!t || !name.trim()) return;
    if (showForm === "new") {
      const id = uid("role");
      db.set((n) => {
        n.roles.push({ id, tenantId: t.id, name: name.trim(), permissions: perms });
      });
    } else if (showForm) {
      db.set((n) => {
        const r = n.roles.find((x) => x.id === (showForm as TenantRole).id);
        if (r) {
          r.name = name.trim();
          r.permissions = perms;
        }
      });
    }
    toast.success("Role disimpan.");
    setShowForm(null);
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => open("new")}
        className="rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground flex items-center gap-1"
      >
        <Plus size={12} /> Tambah Role
      </button>
      <div className="space-y-2">
        {roles.length === 0 && (
          <div className="neu p-4 text-center text-xs text-muted-foreground">Belum ada role.</div>
        )}
        {roles.map((r) => (
          <div key={r.id} className="neu p-3 flex justify-between items-start">
            <div>
              <div className="font-semibold text-sm">{r.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {r.permissions.length === 0
                  ? "Tidak ada akses"
                  : r.permissions
                      .map(
                        (p) => PERMISSIONS.find((x) => x.key === p)?.label ?? p,
                      )
                      .join(", ")}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => open(r)} className="p-1 rounded neu-sm">
                <Pencil size={12} />
              </button>
              <button
                onClick={() => {
                  db.set((n) => {
                    n.roles = n.roles.filter((x) => x.id !== r.id);
                  });
                  toast.success("Role dihapus.");
                }}
                className="p-1 rounded bg-destructive/10 text-destructive"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(null)} title={showForm === "new" ? "Tambah Role" : "Edit Role"}>
          <div className="space-y-3">
            <Input label="Nama Role" value={name} onChange={setName} />
            <div>
              <span className="block text-xs font-semibold text-muted-foreground mb-2">
                Akses / Izin
              </span>
              <div className="space-y-1">
                {PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perms.includes(p.key)}
                      onChange={(e) => {
                        setPerms((prev) =>
                          e.target.checked ? [...prev, p.key] : prev.filter((x) => x !== p.key),
                        );
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={save}
              className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Simpan
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="neu w-full max-w-md rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded neu-sm">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted-foreground mb-1">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg neu-inset px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </label>
  );
}
