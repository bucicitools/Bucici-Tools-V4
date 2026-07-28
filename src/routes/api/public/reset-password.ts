import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public forgot-password endpoint: verifies (email, license) match a tenant owner
// via the SECURITY DEFINER RPC verify_license_owner, then resets the password.
export const Route = createFileRoute("/api/public/reset-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { email, businessName, licenseCode, newPassword } = (await request.json()) as {
            email?: string;
            businessName?: string;
            licenseCode?: string;
            newPassword?: string;
          };
          if (!email || !businessName || !licenseCode || !newPassword) {
            return Response.json(
              { error: "Email, nama toko, kode lisensi & password baru wajib diisi." },
              { status: 400 },
            );
          }
          if (newPassword.length < 6) {
            return Response.json({ error: "Password minimal 6 karakter." }, { status: 400 });
          }
          if (!/^BUCICI-[A-Za-z0-9]{4,}$/i.test(licenseCode)) {
            return Response.json({ error: "Format kode lisensi salah." }, { status: 400 });
          }

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`)
                  h.delete("Authorization");
                h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          const { data: uidData, error: rpcErr } = await anon.rpc("verify_license_owner", {
            _email: email,
            _code: licenseCode.toUpperCase(),
            _business_name: businessName,
          });
          if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 500 });
          if (!uidData) {
            return Response.json(
              { error: "Kombinasi email, nama toko & kode lisensi tidak cocok." },
              { status: 404 },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
            uidData as string,
            { password: newPassword },
          );
          if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ error: (e as Error).message ?? "Unknown error" }, { status: 500 });
        }
      },
    },
  },
});
