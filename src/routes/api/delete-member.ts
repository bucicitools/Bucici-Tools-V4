import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/delete-member")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : "";
          if (!token) return Response.json({ error: "Tidak terautentikasi." }, { status: 401 });

          const SUPABASE_URL =
            process.env.SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL ||
            "https://knufqsnamewqsboeitba.supabase.co";
          const SUPABASE_PUBLISHABLE_KEY =
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            "sb_publishable_nCM8f5v151h1ZaobsxVJSA_-ITWXZvv";
          const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
          const { data: userData, error: userErr } = await authClient.auth.getUser(token);
          if (userErr || !userData?.user) {
            return Response.json({ error: "Sesi tidak valid." }, { status: 401 });
          }

          const { memberId } = (await request.json()) as { memberId?: string };
          if (!memberId) {
            return Response.json({ error: "memberId wajib diisi." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Delete profile row
          await supabaseAdmin.from("profiles").delete().eq("id", memberId);
          // Delete user_roles row
          await supabaseAdmin.from("user_roles").delete().eq("user_id", memberId);
          // Delete auth user via admin API
          try {
            await supabaseAdmin.auth.admin.deleteUser(memberId);
          } catch (delErr) {
            console.warn("Could not delete auth user:", delErr);
          }

          return Response.json({ ok: true });
        } catch (err) {
          return Response.json(
            { error: (err as Error).message || "Gagal menghapus anggota." },
            { status: 500 },
          );
        }
      },
    },
  },
});
