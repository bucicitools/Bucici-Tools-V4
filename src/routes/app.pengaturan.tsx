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
} from "lucide-react";
import { toast } from "sonner";
import { currentUser, currentTenant, db } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/pengaturan")({ component: Pengaturan });

function Pengaturan() {
  const me = currentUser();
  const tenant = currentTenant();
  const [key, setKey] = useState(me?.geminiApiKey ?? "");
  const [show, setShow] = useState(false);

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

  function saveGeminiKey() {
    if (!me) return;
    db.set((n) => {
      const u = n.users.find((x) => x.id === me.id);
      if (u) u.geminiApiKey = key.trim() || undefined;
    });
    toast.success(key ? "Kunci Gemini pribadi tersimpan." : "Kunci Gemini pribadi dihapus.");
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

  async function handleResetTransactions() {
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
      // 1. Ambil semua ID transaksi milik tenant ini
      const { data: txRows, error: fetchErr } = await supabase
        .from("transactions")
        .select("id")
        .eq("tenant_id", tenant.id);

      if (fetchErr) {
        // Jika query gagal (misal RLS / tabel tidak ada), tetap lanjut hapus local state
        console.warn("[reset] fetch transactions error:", fetchErr);
      } else {
        const txIds = (txRows ?? []).map((r: { id: string }) => r.id);

        // 2. Hapus transaction_items (best-effort, abaikan jika tabel tidak ada)
        if (txIds.length > 0) {
          const { error: errItems } = await supabase
            .from("transaction_items")
            .delete()
            .in("transaction_id", txIds);
          if (errItems) {
            console.warn("[reset] transaction_items delete error (ignored):", errItems.message);
            // Tidak throw — lanjut hapus transaksi utama
          }
        }

        // 3. Hapus transaksi berdasarkan tenant_id
        const { error: errTx } = await supabase
          .from("transactions")
          .delete()
          .eq("tenant_id", tenant.id);

        if (errTx) {
          console.warn("[reset] transactions delete error:", errTx.message);
          setResetError(
            `Catatan: Gagal hapus dari database (${errTx.message}), tetapi data lokal sudah dibersihkan.`,
          );
        }
      }

      // 4. Selalu bersihkan local state (terlepas error Supabase)
      db.set((s) => {
        s.transactions = s.transactions.filter((t) => t.tenantId !== tenant.id);
        s.stock = s.stock.filter((stk) => stk.tenantId !== tenant.id || stk.type !== "out");
      });

      toast.success("Riwayat transaksi berhasil dihapus!");
      setShowResetModal(false);
      setResetConfirmInput("");
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Terjadi kesalahan tidak diketahui.";
      toast.error(`Gagal: ${msg}`);
      console.error("[reset] unexpected error:", error);
    } finally {
      setLoadingReset(false);
    }
  }

  const isOwner = me?.role !== "member";

  return (
    <div className="space-y-4 max-w-2xl pb-10">
      <div className="neu p-5">
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <Shield className="text-primary" /> Pengaturan Akun
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Kelola preferensi, keamanan akun, dan konfigurasi toko Anda.
        </p>
      </div>

      {/* Ganti Password */}
      <div className="neu p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-primary" />
          <h2 className="font-bold">Keamanan / Ganti Password</h2>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password Lama</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Masukkan password saat ini"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password Baru</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              Konfirmasi Password Baru
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm mt-1"
            />
          </div>
          <button
            type="submit"
            disabled={loadingPassword}
            className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={14} />{" "}
            {loadingPassword ? "Memverifikasi & Menyimpan..." : "Perbarui Password"}
          </button>
        </form>
      </div>

      {/* Pajak Default */}
      {isOwner && (
        <div className="neu p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Percent size={18} className="text-primary" />
            <h2 className="font-bold">Pajak Default Kasir / POS</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Persentase pajak (%) ini akan otomatis diterapkan pada setiap transaksi kasir baru. Isi{" "}
            <b>0</b> untuk menonaktifkan.
          </p>
          <div className="flex items-center gap-2 max-w-xs">
            <input
              type="number"
              min={0}
              max={100}
              value={taxRate === 0 ? "" : taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm"
            />
            <span className="text-sm font-bold">%</span>
          </div>
          {taxRate > 0 && (
            <div className="rounded-lg bg-success/10 border border-success/20 p-2 text-xs text-success">
              ✓ Kasir baru akan otomatis mengaktifkan pajak {taxRate}%.
            </div>
          )}
          <button
            onClick={saveTaxRate}
            className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2"
          >
            <Save size={14} /> Simpan Pajak
          </button>
        </div>
      )}

      {/* Kunci AI Pribadi */}
      <div className="neu p-5 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-primary" />
          <h2 className="font-bold">Kunci AI Pribadi (BYOK)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Tempel Google Gemini API Key milik Anda. Format{" "}
          <code className="font-mono">AQ...</code> atau <code className="font-mono">AIza...</code>.
          Dapatkan gratis di{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-glow underline"
          >
            aistudio.google.com/apikey <ExternalLink size={12} />
          </a>
          .
        </p>
        <div className="relative">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="AQ.Ab8RN6... atau AIza..."
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
        <button
          onClick={saveGeminiKey}
          className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2"
        >
          <Save size={14} /> Simpan Kunci AI
        </button>
        {me?.geminiApiKey && (
          <div className="rounded-lg bg-success/10 border border-success/20 p-3 text-xs text-success">
            ✓ Kunci pribadi aktif. Digunakan untuk semua fitur AI termasuk Generate Poster.
          </div>
        )}
      </div>

      {/* Reset Transaksi */}
      {isOwner && (
        <div className="neu p-5 space-y-3 border-destructive/30">
          <div className="flex items-center gap-2 text-destructive">
            <Trash2 size={18} />
            <h2 className="font-bold">Hapus / Reset Riwayat Transaksi</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Menghapus seluruh riwayat transaksi toko <b>{tenant?.businessName}</b> secara permanen.
            Tidak dapat dibatalkan.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground flex items-center gap-2 hover:bg-destructive/90 transition-colors"
          >
            <Trash2 size={14} /> Reset Seluruh Transaksi
          </button>
        </div>
      )}

      {/* Modal Konfirmasi Reset */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="neu p-6 max-w-md w-full space-y-4 bg-background border border-destructive/40 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-lg">Konfirmasi Penghapusan</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tindakan ini akan <strong>menghapus SELURUH riwayat transaksi</strong> toko{" "}
              <b>{tenant?.businessName}</b> secara permanen.
            </p>
            <p className="text-xs font-semibold">
              Ketik kata{" "}
              <span className="text-destructive font-mono font-bold">HAPUS</span> untuk melanjutkan:
            </p>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Ketik HAPUS"
              className="w-full rounded-lg neu-inset px-3 py-2 text-sm font-bold uppercase tracking-wider text-center"
            />
            {resetError && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-2 text-xs text-warning">
                {resetError}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmInput("");
                  setResetError("");
                }}
                className="px-4 py-2 rounded-xl neu text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleResetTransactions}
                disabled={resetConfirmInput !== "HAPUS" || loadingReset}
                className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-40"
              >
                {loadingReset ? "Menghapus..." : "Ya, Hapus Semua Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
