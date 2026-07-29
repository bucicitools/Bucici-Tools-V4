import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  KeyRound,
  Save,
  Eye,
  EyeOff,
  Shield,
  ExternalLink,
  Lock,
  Percent,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { currentUser, currentTenant, db } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { saveGeminiKeyLocal, readGeminiKeyLocal } from "@/lib/gemini";

export const Route = createFileRoute("/app/pengaturan")({ component: Pengaturan });

function Pengaturan() {
  const me = currentUser();
  const tenant = currentTenant();
  // Read from localStorage directly — most reliable source
  const [key, setKey] = useState(() => readGeminiKeyLocal() || me?.geminiApiKey || "");
  const [show, setShow] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);

  const [taxRate, setTaxRate] = useState<number>(() => {
    return Number(localStorage.getItem("bucici_tax_rate") || "0");
  });

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [loadingReset, setLoadingReset] = useState(false);
  const [resetError, setResetError] = useState("");

  async function saveGeminiKey() {
    setSavingKey(true);
    try {
      const trimmed = key.trim();

      // 1. Save to localStorage immediately (used by getGeminiKey())
      saveGeminiKeyLocal(trimmed);

      // 2. Also update store (in-memory)
      if (me) {
        db.set((n) => {
          const u = n.users.find((x) => x.id === me.id);
          if (u) u.geminiApiKey = trimmed || undefined;
        });
      }

      // 3. Always persist to Supabase profiles (clear when empty, set when filled)
      // This ensures stale keys from previous sessions don't leak back via hydration
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          await supabase
            .from("profiles")
            .update({ gemini_api_key: trimmed || null })
            .eq("id", uid);
        }
      } catch {
        // Non-fatal: localStorage is the source of truth
      }

      toast.success(trimmed ? "Kunci Gemini tersimpan! Siap digunakan." : "Kunci Gemini dihapus dari semua perangkat.");
    } catch {
      toast.error("Gagal menyimpan kunci. Coba lagi.");
    } finally {
      setSavingKey(false);
    }
  }

  async function clearGeminiKey() {
    setKey("");
    setSavingKey(true);
    try {
      // Clear localStorage
      saveGeminiKeyLocal("");

      // Clear store
      if (me) {
        db.set((n) => {
          const u = n.users.find((x) => x.id === me.id);
          if (u) u.geminiApiKey = undefined;
        });
      }

      // Clear Supabase — critical to prevent stale key from coming back on next login
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          await supabase
            .from("profiles")
            .update({ gemini_api_key: null })
            .eq("id", uid);
        }
      } catch {
        // Non-fatal
      }

      toast.success("Kunci AI dihapus dari semua perangkat.");
    } catch {
      toast.error("Gagal menghapus kunci. Coba lagi.");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPassword) return toast.error("Password lama wajib diisi.");
    if (!newPassword) return toast.error("Password baru tidak boleh kosong.");
    if (newPassword.length < 6) return toast.error("Password baru minimal 6 karakter.");
    if (newPassword !== confirmPassword) return toast.error("Konfirmasi password baru tidak cocok.");

    setLoadingPassword(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData?.user?.email;
      if (!userEmail) {
        toast.error("Sesi tidak ditemukan. Silakan login kembali.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      });
      if (signInError) {
        toast.error("Password lama tidak sesuai.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        toast.error(`Gagal mengubah password: ${updateError.message}`);
      } else {
        toast.success("Password berhasil diperbarui!");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Terjadi kesalahan saat memperbarui password.");
    } finally {
      setLoadingPassword(false);
    }
  }

  function saveTaxRate() {
    const val = Math.max(0, Math.min(100, taxRate));
    localStorage.setItem("bucici_tax_rate", val.toString());
    setTaxRate(val);
    toast.success(
      val > 0
        ? `Pajak default ${val}% tersimpan. Aktif otomatis di kasir baru.`
        : "Pajak default dinonaktifkan. Kasir baru mulai tanpa pajak.",
    );
  }

  async function handleHapusDataKeuangan() {
    if (resetConfirmInput !== "HAPUS") {
      toast.error("Ketik kata HAPUS dengan huruf kapital untuk mengonfirmasi.");
      return;
    }
    if (!tenant) {
      toast.error("Data toko tidak ditemukan.");
      return;
    }

    setLoadingReset(true);
    setResetError("");

    try {
      const { data: txRows } = await supabase
        .from("transactions")
        .select("id")
        .eq("tenant_id", tenant.id);

      const txIds = (txRows ?? []).map((r: { id: string }) => r.id);
      if (txIds.length > 0) {
        const { error: errItems } = await supabase
          .from("transaction_items")
          .delete()
          .in("transaction_id", txIds);
        if (errItems) console.warn("[hapus] transaction_items error (ignored):", errItems.message);
      }

      const { error: errTx } = await supabase.from("transactions").delete().eq("tenant_id", tenant.id);
      if (errTx) setResetError((prev) => prev + `Transaksi: ${errTx.message}. `);

      const { error: errCash } = await supabase.from("cash").delete().eq("tenant_id", tenant.id);
      if (errCash) setResetError((prev) => prev + `Kas: ${errCash.message}. `);

      await supabase.from("stock_movements").delete().eq("tenant_id", tenant.id);

      db.set((s) => {
        s.transactions = s.transactions.filter((t) => t.tenantId !== tenant.id);
        s.cash = s.cash.filter((c) => c.tenantId !== tenant.id);
        s.stock = s.stock.filter((stk) => stk.tenantId !== tenant.id);
      });

      if (typeof window !== "undefined") {
        localStorage.removeItem(`bucici_db_v2_${tenant.id}`);
        localStorage.removeItem("bucici_pending_cash");
        localStorage.removeItem("bucici_pending_tx");
        localStorage.removeItem("bucici_pending_stock");
        localStorage.removeItem("bucici_pending_prod");
        localStorage.removeItem("bucici_pending_cat");
      }

      toast.success("Data keuangan berhasil dihapus!");
      setShowResetModal(false);
      setResetConfirmInput("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Terjadi kesalahan tidak diketahui.";
      toast.error(`Gagal: ${msg}`);
    } finally {
      setLoadingReset(false);
    }
  }

  const isOwner = me?.role !== "member";
  const activeKey = readGeminiKeyLocal() || me?.geminiApiKey;

  return (
    <div className="max-w-lg mx-auto space-y-4 py-2">
      <div className="rounded-2xl neu p-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Shield size={20} className="text-primary" /> Pengaturan Akun
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Kelola preferensi, keamanan akun, dan konfigurasi toko Anda.
        </p>
      </div>

      {/* Ganti Password */}
      <div className="rounded-2xl neu p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Lock size={16} /> Keamanan / Ganti Password
        </h2>
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            Password Lama
            <input
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              type="password"
              placeholder="Masukkan password saat ini"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Password Baru
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              placeholder="Minimal 6 karakter"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Konfirmasi Password Baru
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              placeholder="Ulangi password baru"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </label>
          <button
            type="submit"
            disabled={loadingPassword}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={14} />{" "}
            {loadingPassword ? "Memverifikasi & Menyimpan..." : "Perbarui Password"}
          </button>
        </form>
      </div>

      {/* Pajak Default */}
      {isOwner && (
        <div className="rounded-2xl neu p-4">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Percent size={16} /> Pajak Default Kasir / POS
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Persentase pajak (%) ini akan otomatis diterapkan pada setiap transaksi kasir baru. Isi{" "}
            <b>0</b> untuk menonaktifkan.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
            />
            <span className="text-sm font-bold">%</span>
          </div>
          {taxRate > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              ✓ Kasir baru akan otomatis mengaktifkan pajak {taxRate}%.
            </p>
          )}
          <button
            onClick={saveTaxRate}
            className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2"
          >
            <Save size={14} /> Simpan Pajak
          </button>
        </div>
      )}

      {/* Kunci AI Pribadi */}
      <div className="rounded-2xl neu p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <KeyRound size={16} /> Kunci AI Pribadi (BYOK)
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Tempel Google Gemini API Key milik Anda. Format{" "}
          <code className="font-mono bg-muted px-1 rounded">AQ...</code> atau{" "}
          <code className="font-mono bg-muted px-1 rounded">AIza...</code>.
          Dapatkan gratis di{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline text-primary inline-flex items-center gap-1"
          >
            aistudio.google.com/apikey <ExternalLink size={10} />
          </a>
          .
        </p>
        <div className="relative">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Tempel API key Anda di sini..."
            className="w-full rounded-lg neu-inset px-3 py-2 pr-10 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={saveGeminiKey}
            disabled={savingKey}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={14} /> {savingKey ? "Menyimpan..." : "Simpan Kunci AI"}
          </button>
          {activeKey && (
            <button
              onClick={clearGeminiKey}
              disabled={savingKey}
              className="rounded-xl border border-destructive/40 text-destructive px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-destructive/10 transition disabled:opacity-50"
            >
              <X size={14} /> Hapus Key
            </button>
          )}
        </div>
        {activeKey ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
            ✓ Kunci aktif ({activeKey.slice(0, 8)}...). Digunakan untuk semua fitur AI.
          </p>
        ) : (
          <p className="text-xs text-amber-500 mt-2">
            ⚠ Belum ada kunci aktif. Isi dan simpan key di atas.
          </p>
        )}
      </div>

      {/* Hapus Data Keuangan */}
      {isOwner && (
        <div className="rounded-2xl neu p-4">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-2 text-destructive">
            <Trash2 size={16} /> Hapus Data Keuangan
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Menghapus seluruh data keuangan toko <b>{tenant?.businessName}</b> secara permanen.
            Data yang dihapus: semua transaksi, catatan kas, dan riwayat stok.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground flex items-center gap-2 hover:bg-destructive/90 transition-colors"
          >
            <Trash2 size={14} /> Hapus Semua Data Keuangan
          </button>
        </div>
      )}

      {/* Modal Konfirmasi */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="rounded-2xl neu p-5 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} /> Konfirmasi Hapus Data Keuangan
            </h3>
            <div className="text-xs space-y-2">
              <p className="font-semibold text-destructive">Data yang akan DIHAPUS permanen:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Semua riwayat transaksi &amp; item pesanan</li>
                <li>Semua catatan kas</li>
                <li>Semua riwayat gerakan stok</li>
              </ul>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Ketik <span className="font-bold text-destructive">HAPUS</span> untuk melanjutkan:
              </p>
              <input
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                placeholder="Ketik HAPUS"
                className="w-full rounded-lg neu-inset px-3 py-2 text-sm font-bold uppercase tracking-wider text-center"
              />
              {resetError && <p className="text-xs text-amber-600 mt-1">⚠️ {resetError}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmInput(""); setResetError(""); }}
                className="px-4 py-2 rounded-xl neu text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleHapusDataKeuangan}
                disabled={loadingReset}
                className="flex-1 rounded-xl bg-destructive text-destructive-foreground px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {loadingReset ? "Menghapus..." : "Ya, Hapus Data Keuangan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
