import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, LogIn, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BuciciLogo } from "@/components/BuciciLogo";
import { login, register, currentUser, isAuthReady, subscribeAuthReady } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const ready = useSyncExternalStore(subscribeAuthReady, isAuthReady, () => false);
  const [hasSuperAdmin, setHasSuperAdmin] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [business, setBusiness] = useState("");

  useEffect(() => {
    void supabase.rpc("has_any_super_admin").then(({ data }) => setHasSuperAdmin(!!data));
  }, []);

  if (!ready || hasSuperAdmin === null) {
    return (
      <div className="min-h-screen bg-metallic flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }
  const me = currentUser();
  if (me) {
    return <Navigate to={me.role === "super_admin" ? "/admin" : "/app"} />;
  }

  const isFirstUser = !hasSuperAdmin;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Selamat datang, ${u.name}`);
      navigate({ to: u.role === "super_admin" ? "/admin" : "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register({
        name,
        email,
        password,
        licenseCode: isFirstUser ? undefined : license,
        businessName: isFirstUser ? undefined : business,
      });
      toast.success(
        isFirstUser ? "Akun Super-Admin berhasil dibuat!" : `Toko ${business} berhasil terdaftar.`,
      );
      navigate({ to: u.role === "super_admin" ? "/admin" : "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-metallic flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BuciciLogo size={120} />
        </div>

        <div className="neu p-6 sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-2 neu-inset p-1">
            <button
              onClick={() => setMode("login")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                  : "text-muted-foreground"
              }`}
            >
              Masuk
            </button>
            <button
              onClick={() => setMode("register")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "register"
                  ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                  : "text-muted-foreground"
              }`}
            >
              Daftar
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-neu"
                  placeholder="nama@toko.com"
                />
              </Field>
              <Field label="Kata Sandi">
                <div className="relative">
                  <input
                    required
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-neu pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-1 text-xs text-primary-glow hover:underline"
                  onClick={() => setForgot(true)}
                >
                  Lupa password?
                </button>
              </Field>
              <button
                disabled={loading}
                className="w-full rounded-xl bg-gradient-primary py-3 font-semibold text-primary-foreground shadow-elegant disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <LogIn size={18} /> Masuk
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              {isFirstUser && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                  🎉 Anda akan menjadi <b>Super-Admin</b> pertama. Tanpa kode lisensi.
                </div>
              )}
              <Field label="Nama Lengkap">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-neu"
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-neu"
                />
              </Field>
              <Field label="Kata Sandi">
                <div className="relative">
                  <input
                    required
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-neu pr-10"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {!isFirstUser && (
                <>
                  <Field label="Kode Lisensi">
                    <input
                      required
                      value={license}
                      onChange={(e) => setLicense(e.target.value.toUpperCase())}
                      className="input-neu font-mono"
                      placeholder="BUCICI-XXXX"
                    />
                  </Field>
                  <Field label="Nama Toko / Tenant">
                    <input
                      required
                      value={business}
                      onChange={(e) => setBusiness(e.target.value)}
                      className="input-neu"
                    />
                  </Field>
                </>
              )}
              <button
                disabled={loading}
                className="w-full rounded-xl bg-gradient-primary py-3 font-semibold text-primary-foreground shadow-elegant disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <UserPlus size={18} /> Daftar
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 BUCICI • Simple Business Buddy.
        </p>
      </div>

      <style>{`
        .input-neu {
          width: 100%;
          padding: 0.65rem 0.9rem;
          border-radius: 0.75rem;
          background: var(--muted);
          box-shadow: var(--shadow-neu-inset);
          border: 1px solid transparent;
          outline: none;
          font-size: 0.9rem;
        }
        .input-neu:focus { border-color: var(--primary-glow); }
      `}</style>
      {forgot && <ForgotPasswordModal onClose={() => setForgot(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !business || !code || !pw) return toast.error("Lengkapi semua kolom.");
    if (pw.length < 6) return toast.error("Password minimal 6 karakter.");
    setBusy(true);
    try {
      const res = await fetch("/api/public/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, businessName: business, licenseCode: code, newPassword: pw }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "Gagal reset password.");
      toast.success("Password berhasil direset. Silakan login dengan password baru.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="neu bg-background rounded-2xl max-w-sm w-full p-5 space-y-3"
      >
        <h3 className="font-bold text-lg">Reset Password</h3>
        <p className="text-xs text-muted-foreground">
          Verifikasi dengan <b>Email</b>, <b>Nama Toko</b>, dan <b>Kode Lisensi</b> yang Anda
          daftarkan. Tidak perlu email konfirmasi.
        </p>
        <Field label="Email">
          <input
            className="input-neu w-full rounded-xl px-3 py-2.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </Field>
        <Field label="Nama Toko / Warung">
          <input
            className="input-neu w-full rounded-xl px-3 py-2.5"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            required
          />
        </Field>
        <Field label="Kode Lisensi">
          <input
            className="input-neu w-full rounded-xl px-3 py-2.5 font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BUCICI-XXXX"
            required
          />
        </Field>
        <Field label="Password Baru">
          <input
            className="input-neu w-full rounded-xl px-3 py-2.5"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            required
          />
        </Field>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl neu-sm py-2 text-sm font-semibold"
          >
            Batal
          </button>
          <button
            disabled={busy}
            className="flex-1 rounded-xl bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Memproses..." : "Reset Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
