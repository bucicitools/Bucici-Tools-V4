// Hybrid store: Supabase Auth + Supabase-mirrored auth tables (users, tenants, licenses, info),
// with local per-user business data (products, transactions, cash, stock, hpp, roles, categories,
// receipts) so a signed-in user's session and shared tables follow them across devices.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Role = "super_admin" | "owner" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // legacy — unused with Supabase Auth
  role: Role;
  tenantId?: string;
  roleId?: string;
  createdAt: string;
  geminiApiKey?: string;
}

export interface Tenant {
  id: string;
  businessName: string;
  ownerId: string;
  ownerName: string;
  licenseCode: string;
  createdAt: string;
  active: boolean;
}

export interface License {
  id: string;
  code: string;
  batch?: string;
  used: boolean;
  usedBy?: string;
  createdAt: string;
}

export interface InfoPost {
  id: string;
  text: string;
  link?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
}
export interface Product {
  id: string;
  tenantId: string;
  name: string;
  price: number;
  cost?: number;
  stock: number;
  sku?: string;
  categoryId?: string;
  image?: string;
}
export interface TenantRole {
  id: string;
  tenantId: string;
  name: string;
  permissions: string[];
}
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  cost?: number;
}
export interface Transaction {
  id: string;
  tenantId: string;
  cashierId: string;
  cashierName: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType: "rp" | "pct";
  tax: number;
  taxPct: number;
  total: number;
  paid: number;
  change: number;
  method: "cash" | "qris" | "transfer" | "credit";
  status: "paid" | "unpaid" | "void";
  customer?: string;
  note?: string;
  dueDate?: string;
  createdAt: string;
  paidAt?: string;
}
export interface CashEntry {
  id: string;
  tenantId: string;
  type: "fill" | "in" | "out";
  amount: number;
  note?: string;
  reset?: boolean;
  createdAt: string;
}
export interface ReceiptSettings {
  header: string;
  address: string;
  phone: string;
  social: string;
  footer: string;
}
export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  type: "in" | "out";
  qty: number;
  unit: string;
  note?: string;
  createdAt: string;
}
export interface HppItem {
  id: string;
  tenantId: string;
  productName: string;
  components: { name: string; unitPrice: number; qty: number; unit: string }[];
  createdAt: string;
}

export interface RoomLock {
  key: string;
  name: string;
  locked: boolean;
  note: string;
}

export const DEFAULT_ROOM_LOCKS: RoomLock[] = [
  { key: "/app/kasir", name: "Ruang Kasir", locked: false, note: "Segera Hadir" },
  { key: "/app/pemasaran", name: "Ruang Pemasaran", locked: false, note: "Dalam Perbaikan" },
  { key: "/app/stok", name: "Ruang Stok", locked: false, note: "Dalam Perbaikan" },
  { key: "/app/modal", name: "Tools Hitung Modal", locked: false, note: "Segera Hadir" },
];

interface DB {
  users: User[];
  tenants: Tenant[];
  licenses: License[];
  info: InfoPost[];
  categories: Category[];
  products: Product[];
  roles: TenantRole[];
  transactions: Transaction[];
  cash: CashEntry[];
  receipts: Record<string, ReceiptSettings>;
  stock: StockMovement[];
  hpp: HppItem[];
  roomLocks: RoomLock[];
  session?: { userId: string; demoMode?: boolean };
}

const LOCAL_PREFIX = "bucici_db_v2_";
const listeners = new Set<() => void>();

function empty(): DB {
  return {
    users: [],
    tenants: [],
    licenses: [],
    info: [],
    categories: [],
    products: [],
    roles: [],
    transactions: [],
    cash: [],
    receipts: {},
    stock: [],
    hpp: [],
    roomLocks: DEFAULT_ROOM_LOCKS,
  };
}
const EMPTY_DB = empty();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function serverSnapshot(): DB {
  return EMPTY_DB;
}

let cache: DB = empty();
let currentAuthUserId: string | null = null;
let authReady = false;
const readyListeners = new Set<() => void>();
export function subscribeAuthReady(cb: () => void) {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}
export function isAuthReady() {
  return authReady;
}

function localKey(tenantId: string | null) {
  return LOCAL_PREFIX + (tenantId ?? "anon");
}

function loadLocalBusiness(tenantId: string | null): Partial<DB> {
  if (typeof window === "undefined" || !tenantId) return {};
  try {
    const raw = localStorage.getItem(localKey(tenantId));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<DB>;
  } catch {
    return {};
  }
}

function persistLocalBusiness(tenantId: string | null) {
  if (typeof window === "undefined" || !tenantId) return;
  const {
    users,
    categories,
    products,
    roles,
    transactions,
    cash,
    receipts,
    stock,
    hpp,
    roomLocks,
  } = cache;
  localStorage.setItem(
    localKey(tenantId),
    JSON.stringify({
      users,
      categories,
      products,
      roles,
      transactions,
      cash,
      receipts,
      stock,
      hpp,
      roomLocks,
    }),
  );
}

// Queue for offline changes
function queueOfflineChange(type: "tx" | "prod" | "cat" | "role", item: unknown) {
  if (typeof window === "undefined") return;
  try {
    const key = `bucici_pending_${type}`;
    const raw = localStorage.getItem(key);
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    list.push(item);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export async function syncOfflineData() {
  if (typeof window === "undefined" || !navigator.onLine) return;
  try {
    // 1. Transactions
    const txRaw = localStorage.getItem("bucici_pending_tx");
    if (txRaw) {
      const pendingTxs: Transaction[] = JSON.parse(txRaw);
      for (const tx of pendingTxs) {
        const { error: txErr } = await supabase.from("transactions").upsert({
          id: tx.id,
          tenant_id: tx.tenantId,
          user_id: tx.cashierId,
          total_amount: tx.total,
          discount_amount: tx.discount,
          tax_amount: tx.tax,
          payment_method: tx.method,
          status: tx.status,
          created_at: tx.createdAt,
        });
        if (!txErr && tx.items?.length) {
          await supabase.from("transaction_items").upsert(
            tx.items.map((item) => ({
              transaction_id: tx.id,
              product_id: item.productId,
              product_name: item.name,
              unit_price: item.price,
              quantity: item.qty,
            })),
          );
        }
      }
      localStorage.removeItem("bucici_pending_tx");
    }

    // 2. Products
    const prodRaw = localStorage.getItem("bucici_pending_prod");
    if (prodRaw) {
      const pendingProds: Product[] = JSON.parse(prodRaw);
      for (const p of pendingProds) {
        await supabase.from("products").upsert({
          id: p.id,
          tenant_id: p.tenantId,
          name: p.name,
          price: p.price,
          cost_price: p.cost ?? null,
          stock: p.stock,
          barcode: p.sku ?? null,
          category: p.categoryId ?? null,
          image_url: p.image ?? null,
        });
      }
      localStorage.removeItem("bucici_pending_prod");
    }

    // 3. Categories
    const catRaw = localStorage.getItem("bucici_pending_cat");
    if (catRaw) {
      const pendingCats: Category[] = JSON.parse(catRaw);
      for (const c of pendingCats) {
        await supabase.from("categories").upsert({
          id: c.id,
          tenant_id: c.tenantId,
          name: c.name,
        });
      }
      localStorage.removeItem("bucici_pending_cat");
    }
  } catch {
    /* ignore sync failures until next online cycle */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void syncOfflineData();
  });
}

function notify() {
  listeners.forEach((l) => l());
}

function get(): DB {
  return cache;
}

export const db = {
  get,
  set(fn: (d: DB) => void) {
    const next = structuredClone(cache);
    fn(next);
    void mirrorChanges(cache, next);
    cache = next;

    const activeTenant = currentTenant();
    persistLocalBusiness(activeTenant?.id ?? currentAuthUserId);
    notify();
  },
  reset() {
    const activeTenant = currentTenant();
    cache = empty();
    persistLocalBusiness(activeTenant?.id ?? currentAuthUserId);
    notify();
  },
  _hydrate(patch: Partial<DB>) {
    cache = { ...cache, ...patch } as DB;
    notify();
  },
};

async function mirrorChanges(prev: DB, next: DB) {
  try {
    for (const t of next.tenants) {
      const p = prev.tenants.find((x) => x.id === t.id);
      if (p && p.active !== t.active) {
        await supabase.from("tenants").update({ active: t.active }).eq("id", t.id);
      }
    }
    const addedLic = next.licenses.filter((l) => !prev.licenses.some((x) => x.id === l.id));
    if (addedLic.length) {
      await supabase.from("licenses").insert(
        addedLic.map((l) => ({
          code: l.code,
          batch: l.batch ?? null,
          used: l.used,
        })),
      );
    }

    // Room locks sync
    if (JSON.stringify(prev.roomLocks) !== JSON.stringify(next.roomLocks)) {
      const lockText = `[ROOM_LOCKS]:${JSON.stringify(next.roomLocks)}`;
      const existing = prev.info.find((i) => i.text.startsWith("[ROOM_LOCKS]:"));
      if (existing) {
        await supabase.from("info_posts").update({ text: lockText }).eq("id", existing.id);
      } else {
        await supabase.from("info_posts").insert({ text: lockText });
      }
    }

    const addedInfo = next.info.filter(
      (i) => !i.text.startsWith("[ROOM_LOCKS]:") && !prev.info.some((x) => x.id === i.id),
    );
    if (addedInfo.length) {
      await supabase
        .from("info_posts")
        .insert(addedInfo.map((i) => ({ text: i.text, link: i.link ?? null })));
    }
    const removedInfo = prev.info.filter((i) => !next.info.some((x) => x.id === i.id));
    for (const i of removedInfo) {
      await supabase.from("info_posts").delete().eq("id", i.id);
    }
    const me = next.users.find((u) => u.id === next.session?.userId);
    const meBefore = prev.users.find((u) => u.id === prev.session?.userId);
    if (me && meBefore && me.geminiApiKey !== meBefore.geminiApiKey) {
      await supabase
        .from("profiles")
        .update({ gemini_api_key: me.geminiApiKey ?? null })
        .eq("id", me.id);
    }

    // Mirror newly added transactions
    const addedTx = next.transactions.filter((t) => !prev.transactions.some((x) => x.id === t.id));
    for (const tx of addedTx) {
      const { error } = await supabase.from("transactions").insert({
        id: tx.id,
        tenant_id: tx.tenantId,
        user_id: tx.cashierId,
        total_amount: tx.total,
        discount_amount: tx.discount,
        tax_amount: tx.tax,
        payment_method: tx.method,
        status: tx.status,
        created_at: tx.createdAt,
      });
      if (error) {
        queueOfflineChange("tx", tx);
      } else if (tx.items?.length) {
        await supabase.from("transaction_items").insert(
          tx.items.map((item) => ({
            transaction_id: tx.id,
            product_id: item.productId,
            product_name: item.name,
            unit_price: item.price,
            quantity: item.qty,
          })),
        );
      }
    }

    // Mirror newly added or updated products
    const addedProds = next.products.filter(
      (p) => !prev.products.some((x) => x.id === p.id && JSON.stringify(x) === JSON.stringify(p)),
    );
    for (const p of addedProds) {
      const { error } = await supabase.from("products").upsert({
        id: p.id,
        tenant_id: p.tenantId,
        name: p.name,
        price: p.price,
        cost_price: p.cost ?? null,
        stock: p.stock,
        barcode: p.sku ?? null,
        category: p.categoryId ?? null,
        image_url: p.image ?? null,
      });
      if (error) queueOfflineChange("prod", p);
    }

    // Mirror categories
    const addedCats = next.categories.filter(
      (c) => !prev.categories.some((x) => x.id === c.id && x.name === c.name),
    );
    for (const c of addedCats) {
      const { error } = await supabase.from("categories").upsert({
        id: c.id,
        tenant_id: c.tenantId,
        name: c.name,
      });
      if (error) queueOfflineChange("cat", c);
    }

    // Mirror tenant roles
    const addedRoles = next.roles.filter(
      (r) =>
        !prev.roles.some(
          (x) =>
            x.id === r.id &&
            x.name === r.name &&
            JSON.stringify(x.permissions) === JSON.stringify(r.permissions),
        ),
    );
    for (const r of addedRoles) {
      const { error } = await supabase.from("tenant_roles").upsert({
        id: r.id,
        tenant_id: r.tenantId,
        name: r.name,
        permissions: r.permissions,
      });
      if (error) queueOfflineChange("role", r);
    }
  } catch {
    /* noop — offline safe */
  }
}

export function useDB<T>(sel: (d: DB) => T): T {
  const snap = useSyncExternalStore(subscribe, get, serverSnapshot);
  return sel(snap);
}

export function uid(_prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============ Auth ============
export function currentUser(): User | undefined {
  const d = get();
  if (!d.session) return undefined;
  return d.users.find((u) => u.id === d.session!.userId);
}

export function currentTenant(): Tenant | undefined {
  const u = currentUser();
  const d = get();
  if (!u?.tenantId) {
    const owned = d.tenants.find((t) => t.ownerId === u?.id);
    if (owned) return owned;
    return undefined;
  }
  const found = d.tenants.find((t) => t.id === u.tenantId);
  if (found) return found;
  return {
    id: u.tenantId,
    businessName: "Toko Utama",
    ownerId: "",
    licenseCode: "",
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export async function hydrateFromSupabase(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  currentAuthUserId = user?.id ?? null;
  if (!user) {
    cache = empty();
    authReady = true;
    readyListeners.forEach((l) => l());
    notify();
    return;
  }

  await runPendingRedeem();

  const [profilesR, tenantsR, licensesR, infoR, rolesR, tenantRolesR] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("tenants").select("*"),
    supabase.from("licenses").select("*").order("created_at", { ascending: false }),
    supabase.from("info_posts").select("*").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("*"),
    supabase.from("tenant_roles").select("*"),
  ]);

  const profiles = profilesR.data ?? [];
  const tenants: Tenant[] = (tenantsR.data ?? []).map((t) => ({
    id: t.id,
    businessName: t.business_name,
    ownerId: t.owner_id,
    ownerName: t.owner_name,
    licenseCode: t.license_code,
    active: t.active,
    createdAt: t.created_at,
  }));
  const licenses: License[] = (licensesR.data ?? []).map((l) => ({
    id: l.id,
    code: l.code,
    batch: l.batch ?? undefined,
    used: l.used,
    usedBy: l.used_by ?? undefined,
    createdAt: l.created_at,
  }));
  const info: InfoPost[] = (infoR.data ?? []).map((i) => ({
    id: i.id,
    text: i.text,
    link: i.link ?? undefined,
    createdAt: i.created_at,
  }));
  const roleRows = rolesR.data ?? [];
  const rawTenantRoles = tenantRolesR.data ?? [];

  const meta = user.user_metadata || {};

  const users: User[] = profiles.map((p) => {
    const roleRow = roleRows.find((r) => r.user_id === p.id);
    const isSA = !!roleRow && roleRow.role === "super_admin";
    const ownsTenant = tenants.some((t) => t.ownerId === p.id);

    // Cari tenantId jika ini adalah Anggota
    const effectiveTenantId =
      p.tenant_id ||
      (p.id === user.id ? meta.tenant_id : undefined) ||
      tenants.find((t) => t.ownerId === p.id)?.id;
    const role: Role = isSA ? "super_admin" : ownsTenant ? "owner" : (p.role as Role) || "member";

    return {
      id: p.id,
      name: p.full_name ?? p.name ?? (p.id === user.id ? meta.full_name : "") ?? "Anggota",
      email: p.email ?? (p.id === user.id ? user.email : "") ?? "",
      password: "",
      role,
      tenantId: effectiveTenantId ?? undefined,
      roleId: p.role_id ?? (p.id === user.id ? meta.role_id : undefined),
      geminiApiKey: p.gemini_api_key ?? undefined,
      createdAt: p.created_at ?? new Date().toISOString(),
    };
  });

  if (!users.some((u) => u.id === user.id)) {
    users.push({
      id: user.id,
      name: meta.full_name || user.email?.split("@")[0] || "Anggota",
      email: user.email || "",
      password: "",
      role: (meta.role as Role) || "member",
      tenantId: meta.tenant_id || undefined,
      roleId: meta.role_id || undefined,
      createdAt: user.created_at || new Date().toISOString(),
    });
  }

  const tenantRoles: TenantRole[] = rawTenantRoles.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    permissions: r.permissions || [],
  }));

  const activeUserObj = users.find((u) => u.id === user.id);
  const activeTenantId = activeUserObj?.tenantId || tenants.find((t) => t.ownerId === user.id)?.id;

  if (
    activeTenantId &&
    activeUserObj &&
    (!activeUserObj.tenantId || activeUserObj.tenantId !== activeTenantId)
  ) {
    activeUserObj.tenantId = activeTenantId;
    void supabase.from("profiles").update({ tenant_id: activeTenantId }).eq("id", user.id);
  }

  const local = loadLocalBusiness(activeTenantId ?? user.id);

  // Ambil data produk & transaksi dari Supabase untuk tenant aktif
  if (activeTenantId) {
    const [prodRes, catRes, txRes] = await Promise.all([
      supabase.from("products").select("*").eq("tenant_id", activeTenantId),
      supabase.from("categories").select("*").eq("tenant_id", activeTenantId),
      supabase
        .from("transactions")
        .select("*, transaction_items(*)")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false }),
    ]);

    if (prodRes.data && prodRes.data.length > 0) {
      local.products = prodRes.data.map((p) => ({
        id: p.id,
        tenantId: p.tenant_id,
        name: p.name,
        price: Number(p.price),
        cost: p.cost_price ? Number(p.cost_price) : undefined,
        stock: p.stock,
        sku: p.barcode,
        categoryId: p.category,
        image: p.image_url,
      }));
    }

    if (catRes.data && catRes.data.length > 0) {
      local.categories = catRes.data.map((c) => ({
        id: c.id,
        tenantId: c.tenant_id,
        name: c.name,
      }));
    }

    if (txRes.data && txRes.data.length > 0) {
      local.transactions = txRes.data.map((t) => ({
        id: t.id,
        tenantId: t.tenant_id,
        cashierId: t.user_id,
        cashierName: "Kasir",
        items: (t.transaction_items || []).map(
          (ti: {
            product_id: string;
            product_name: string;
            unit_price: number;
            quantity: number;
          }) => ({
            productId: ti.product_id,
            name: ti.product_name,
            price: Number(ti.unit_price),
            qty: ti.quantity,
          }),
        ),
        subtotal: Number(t.total_amount),
        discount: Number(t.discount_amount || 0),
        discountType: "rp",
        tax: Number(t.tax_amount || 0),
        taxPct: 0,
        total: Number(t.total_amount),
        paid: Number(t.total_amount),
        change: 0,
        method:
          (t.payment_method?.toLowerCase() as "cash" | "qris" | "transfer" | "credit") || "cash",
        status: (t.status?.toLowerCase() as "paid" | "unpaid" | "void") || "paid",
        createdAt: t.created_at,
      }));
    }
  }

  // Ensure any member without tenantId is assigned activeTenantId
  users.forEach((u) => {
    if (!u.tenantId && activeTenantId && u.role === "member") {
      u.tenantId = activeTenantId;
    }
  });

  const mergedUsers = [...users];
  if (local.users && Array.isArray(local.users)) {
    for (const lu of local.users) {
      if (!mergedUsers.some((u) => u.id === lu.id)) {
        mergedUsers.push(lu);
      }
    }
  }

  cache = {
    ...empty(),
    ...local,
    users: mergedUsers,
    tenants,
    licenses,
    info: info.filter((i) => !i.text.startsWith("[ROOM_LOCKS]:")),
    roles: tenantRoles.length > 0 ? tenantRoles : (local.roles ?? []),
    roomLocks: (() => {
      const lockPost = info.find((i) => i.text.startsWith("[ROOM_LOCKS]:"));
      if (lockPost) {
        try {
          const parsed = JSON.parse(lockPost.text.slice(13));
          if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch {
          /* noop */
        }
      }
      return local.roomLocks && local.roomLocks.length ? local.roomLocks : DEFAULT_ROOM_LOCKS;
    })(),
    session: { userId: user.id },
  } as DB;

  authReady = true;
  readyListeners.forEach((l) => l());
  notify();

  void syncOfflineData();
}

export function getMemberPermissions(u: User | undefined): string[] {
  if (!u) return [];
  if (u.role === "super_admin" || u.role === "owner") return ["ALL"];
  const d = get();
  const r = d.roles.find((role) => role.id === u.roleId);
  if (r && r.permissions) return r.permissions;
  if (!u.roleId || u.roleId === "kasir" || u.roleId.includes("kasir"))
    return ["pos", "kas", "riwayat"];
  if (u.roleId === "manajer" || u.roleId.includes("manajer"))
    return ["pos", "rekap", "kas", "manajemen.produk", "riwayat", "struk", "ai"];
  return ["pos", "kas", "riwayat"];
}

export function hasPermission(u: User | undefined, permKey: string): boolean {
  if (!u) return false;
  if (u.role === "super_admin" || u.role === "owner") return true;
  const perms = getMemberPermissions(u);
  if (perms.includes("ALL")) return true;
  if (!permKey || permKey === "all") return true;
  return perms.some((p) => p === permKey || permKey.startsWith(p) || p.startsWith(permKey));
}

export function getFirstAllowedRoute(u: User | undefined): string {
  if (!u) return "/app/kasir/pos";
  if (u.role === "super_admin" || u.role === "owner") return "/app/kasir";

  const candidates = [
    { path: "/app/kasir/pos", perm: "pos" },
    { path: "/app/kasir/rekap", perm: "rekap" },
    { path: "/app/kasir/kas", perm: "kas" },
    { path: "/app/kasir/manajemen", perm: "manajemen" },
    { path: "/app/kasir/riwayat", perm: "riwayat" },
    { path: "/app/kasir/struk", perm: "struk" },
    { path: "/app/kasir/ai", perm: "ai" },
    { path: "/app/stok", perm: "stok" },
    { path: "/app/pemasaran", perm: "pemasaran" },
    { path: "/app/modal", perm: "modal" },
  ];

  for (const c of candidates) {
    if (hasPermission(u, c.perm)) {
      return c.path;
    }
  }
  return "/app/kasir/pos";
}

export function isRoomLocked(roomKey: string): { locked: boolean; note: string } {
  const d = get();
  const locks = d.roomLocks || DEFAULT_ROOM_LOCKS;
  const found = locks.find((l) => l.key === roomKey || roomKey.startsWith(l.key));
  if (found && found.locked) {
    return { locked: true, note: found.note || "Ruangan ini sedang dikunci." };
  }
  return { locked: false, note: "" };
}

export async function login(email: string, password: string): Promise<User> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(
      error.message === "Invalid login credentials"
        ? "Email atau kata sandi salah."
        : error.message,
    );
  await hydrateFromSupabase();
  const me = currentUser();
  if (!me) throw new Error("Gagal memuat profil.");
  return me;
}

export async function logout() {
  await supabase.auth.signOut();
  currentAuthUserId = null;
  cache = empty();
  notify();
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  licenseCode?: string;
  businessName?: string;
}): Promise<User> {
  const { data: hasSA } = await supabase.rpc("has_any_super_admin");
  const isFirst = !hasSA;

  if (!isFirst) {
    if (!input.licenseCode || !/^BUCICI-[A-Za-z0-9]{4,}$/.test(input.licenseCode)) {
      throw new Error("Format kode lisensi salah. Contoh: BUCICI-XXXX");
    }
    if (!input.businessName) throw new Error("Nama Toko wajib diisi.");
    const { data: available, error: preErr } = await supabase.rpc("license_available", {
      _code: input.licenseCode,
    });
    if (preErr) throw new Error(preErr.message);
    if (!available) throw new Error("Kode lisensi tidak ditemukan atau sudah dipakai.");
  }

  const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { data: signup, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { name: input.name }, emailRedirectTo },
  });
  if (error) throw new Error(error.message);
  if (!signup.user) throw new Error("Pendaftaran gagal.");

  if (!isFirst && typeof window !== "undefined") {
    localStorage.setItem(
      "bucici_pending_redeem",
      JSON.stringify({
        licenseCode: input.licenseCode,
        businessName: input.businessName,
        name: input.name,
      }),
    );
  }

  if (!signup.session) {
    throw new Error(
      "Cek inbox email Anda untuk verifikasi. Setelah itu login untuk mengaktifkan toko Anda sebagai Owner.",
    );
  }

  await supabase
    .from("profiles")
    .upsert({ id: signup.user.id, name: input.name, email: input.email });

  if (!isFirst) await runPendingRedeem();

  await hydrateFromSupabase();
  const me = currentUser();
  if (!me) throw new Error("Gagal memuat profil setelah pendaftaran.");
  return me;
}

async function runPendingRedeem(): Promise<void> {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem("bucici_pending_redeem");
  if (!raw) return;
  try {
    const p = JSON.parse(raw) as { licenseCode?: string; businessName?: string; name?: string };
    if (!p.licenseCode || !p.businessName) {
      localStorage.removeItem("bucici_pending_redeem");
      return;
    }
    const { data: tenantId, error } = await supabase.rpc("redeem_license", {
      _code: p.licenseCode,
      _business_name: p.businessName,
      _owner_name: p.name ?? "",
    });
    if (error) return;
    if (tenantId) {
      db.set((n) => {
        n.receipts[tenantId as string] = {
          header: p.businessName!,
          address: "",
          phone: "",
          social: "",
          footer: "Terima kasih",
        };
      });
    }
    localStorage.removeItem("bucici_pending_redeem");
  } catch {
    /* keep pending */
  }
}

export function formatIDR(n: number) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      void hydrateFromSupabase();
    } else if (event === "SIGNED_OUT") {
      currentAuthUserId = null;
      cache = empty();
      notify();
    }
  });
}
