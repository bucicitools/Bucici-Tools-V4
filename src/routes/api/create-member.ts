import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Owner-only endpoint: creates a Supabase auth user with email pre-confirmed
// and attaches profile.tenant_id = owner's tenant. Requires Bearer session token
// of the calling Owner.
export const Route = createFileRoute("/api/create-member")({
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
          const callerId = userData.user.id;

          const { name, email, password, roleId } = (await request.json()) as {
            name?: string;
            email?: string;
            password?: string;
            roleId?: string;
          };
          if (!name || !email || !password) {
            return Response.json({ error: "Nama, email & password wajib diisi." }, { status: 400 });
          }
          if (password.length < 6) {
            return Response.json({ error: "Password minimal 6 karakter." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Check caller's profile
          const { data: callerProfile } = await supabaseAdmin
            .from("profiles")
            .select("id, tenant_id, name, email")
            .eq("id", callerId)
            .maybeSingle();

          // 2. Check caller's owned tenants (by owner_id)
          const { data: ownedTenants } = await supabaseAdmin
            .from("tenants")
            .select("id, owner_id, owner_name")
            .eq("owner_id", callerId);

          // 3. Check caller's user_roles
          const { data: callerRoles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", callerId);

          const isSuperAdmin = callerRoles?.some((r) => r.role === "super_admin");
          const ownedTenant = ownedTenants?.[0];

          let tenantId: string | null =
            ownedTenant?.id ||
            callerProfile?.tenant_id ||
            userData.user.user_metadata?.tenant_id ||
            null;

          // Fallback 1: super_admin gets first available tenant
          if (!tenantId && isSuperAdmin) {
            const { data: anyTenant } = await supabaseAdmin
              .from("tenants")
              .select("id")
              .limit(1);
            if (anyTenant?.[0]) tenantId = anyTenant[0].id;
          }

          // Fallback 2: search all tenants for one belonging to this user
          // (handles case where owner_id wasn't set correctly during registration)
          if (!tenantId) {
            const { data: allTenants } = await supabaseAdmin
              .from("tenants")
              .select("id, owner_id, owner_name")
              .order("created_at", { ascending: true })
              .limit(10);

            if (allTenants && allTenants.length > 0) {
              // Try to match by owner_name or owner_id
              const matched = allTenants.find(
                (t) =>
                  t.owner_id === callerId ||
                  (callerProfile?.name &&
                    t.owner_name
                      ?.toLowerCase()
                      .includes(callerProfile.name.toLowerCase())),
              );
              if (matched) {
                tenantId = matched.id;
              } else if (allTenants.length === 1) {
                // Only one tenant in the system — safe to assume it's theirs
                tenantId = allTenants[0].id;
                // Fix the owner_id if it's wrong
                if (allTenants[0].owner_id !== callerId) {
                  await supabaseAdmin
                    .from("tenants")
                    .update({ owner_id: callerId })
                    .eq("id", tenantId);
                }
              }
            }
          }

          if (!tenantId) {
            return Response.json(
              {
                error:
                  "Toko belum terkonfigurasi. Pastikan sudah login dan toko sudah aktif, lalu coba lagi.",
              },
              { status: 403 },
            );
          }

          // Ensure caller's profile has tenant_id set
          if (callerProfile && !callerProfile.tenant_id) {
            await supabaseAdmin
              .from("profiles")
              .update({ tenant_id: tenantId })
              .eq("id", callerId);
          }

          // Create auth user with email pre-confirmed (no verification email).
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, tenant_id: tenantId, role_id: roleId ?? null, role: "member" },
          });
          if (createErr || !created?.user) {
            return Response.json(
              { error: createErr?.message ?? "Gagal membuat akun." },
              { status: 400 },
            );
          }
          const newId = created.user.id;

          // Upsert profile with tenant_id & role_id
          const { error: profErr } = await supabaseAdmin
            .from("profiles")
            .upsert({ id: newId, name, email, tenant_id: tenantId, role_id: roleId ?? null });
          if (profErr) {
            return Response.json({ error: profErr.message }, { status: 500 });
          }

          // Insert member role entry
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: newId, role: "member" }, { onConflict: "user_id,role" });

          return Response.json({ ok: true, userId: newId });
        } catch (e) {
          return Response.json({ error: (e as Error).message ?? "Unknown error" }, { status: 500 });
        }
      },
    },
  },
});
