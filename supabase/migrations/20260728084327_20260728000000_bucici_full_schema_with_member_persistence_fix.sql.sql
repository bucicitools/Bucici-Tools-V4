/*
# BUCICI Full Schema + Member Persistence Fix

## Problem
When an Owner invited a member (via Manajemen → Pengguna → Tambah Anggota),
the member appeared in the list immediately because the local in-memory cache
was updated. But after the Owner logged out and logged back in, the member
disappeared. Root cause: the `profiles` table RLS policy only allowed each
authenticated user to read THEIR OWN row (`auth.uid() = id`), so when the Owner
re-queried `profiles`, Supabase filtered out every other member's row.

## Fix
Replace the self-only SELECT policy on `profiles` with a tenant-scoped policy:
an authenticated user may SELECT any profile that shares their `tenant_id`
(plus their own row and all rows for super_admin). INSERT/UPDATE stay
owner-scoped. This makes invited members visible to the Owner after relogin.

## 1. New Tables
- `profiles` — user profile, linked to auth.users, with tenant_id + role_id
- `tenants` — a business/store, owned by an auth user
- `user_roles` — maps auth user -> app_role (super_admin/owner/member)
- `tenant_roles` — custom roles defined per-tenant (e.g. "Kasir", "Manajer")
- `licenses` — license codes (BUCICI-XXXX) redeemable to create a tenant
- `info_posts` — broadcast announcements from super_admin
- `products` — tenant-scoped product catalog
- `categories` — tenant-scoped product categories
- `transactions` — tenant-scoped sales records
- `transaction_items` — line items per transaction
- `cash` — tenant-scoped cash drawer entries
- `stock_movements` — tenant-scoped stock in/out log

## 2. Security
- RLS enabled on every public table.
- `profiles` SELECT: tenant-scoped (same tenant_id), own row, or super_admin.
- `profiles` INSERT/UPDATE: own row only (members created via server fn / trigger).
- `tenants`: owner or super_admin can read/update.
- `user_roles`: read own or super_admin; no client writes.
- `tenant_roles`, `products`, `categories`, `transactions`, `transaction_items`,
  `cash`, `stock_movements`: tenant-scoped CRUD (member of same tenant).
- `licenses`: super_admin manage; anon precheck via `license_available` RPC.
- `info_posts`: public read; super_admin manage.

## 3. Functions
- `handle_new_user` trigger: creates profile on signup, promotes first user
  to super_admin.
- `has_role(uid, role)`, `has_any_super_admin()`: role checks used in RLS.
- `license_available(code)`, `redeem_license(code, business, owner)`: license
  flow (SECURITY DEFINER).
- `verify_license_owner(email, code, business)`: password reset verification.
*/

-- =========================================================
-- ENUM
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'owner', 'member');

-- =========================================================
-- TABLES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text NOT NULL DEFAULT '',
  license_code text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  role_id text,
  gemini_api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  batch text,
  used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.info_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  cost_price numeric,
  stock numeric NOT NULL DEFAULT 0,
  barcode text,
  category text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'in',
  amount numeric NOT NULL DEFAULT 0,
  note text,
  reset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  type text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- GRANTS
-- =========================================================
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_roles TO authenticated;
GRANT ALL ON public.tenant_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.info_posts TO authenticated;
GRANT ALL ON public.info_posts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_items TO authenticated;
GRANT ALL ON public.transaction_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash TO authenticated;
GRANT ALL ON public.cash TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

-- =========================================================
-- RLS ENABLE
-- =========================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.license_available(_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.licenses WHERE code = _code AND used = false);
$$;

CREATE OR REPLACE FUNCTION public.redeem_license(_code text, _business_name text, _owner_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lic_id uuid;
  _used boolean;
  _tenant_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Tidak terautentikasi.'; END IF;
  IF _business_name IS NULL OR length(trim(_business_name)) = 0 THEN
    RAISE EXCEPTION 'Nama toko wajib diisi.';
  END IF;
  SELECT id, used INTO _lic_id, _used FROM public.licenses WHERE code = _code FOR UPDATE;
  IF _lic_id IS NULL THEN RAISE EXCEPTION 'Kode lisensi tidak ditemukan.'; END IF;
  IF _used THEN RAISE EXCEPTION 'Kode lisensi sudah dipakai.'; END IF;

  INSERT INTO public.tenants (business_name, owner_id, owner_name, license_code)
  VALUES (_business_name, _uid, _owner_name, _code)
  RETURNING id INTO _tenant_id;

  UPDATE public.licenses SET used = true, used_by = _tenant_id WHERE id = _lic_id;
  UPDATE public.profiles SET tenant_id = _tenant_id WHERE id = _uid;
  RETURN _tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_license_owner(_email text, _code text, _business_name text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT p.id INTO _uid
  FROM public.profiles p
  JOIN public.tenants t ON t.owner_id = p.id
  WHERE lower(p.email) = lower(_email)
    AND t.license_code = _code
    AND lower(trim(t.business_name)) = lower(trim(_business_name))
  LIMIT 1;
  RETURN _uid;
END;
$$;

-- Function grants
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.has_any_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_super_admin() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.license_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_available(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_license(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_license(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_license_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_license_owner(text, text, text) TO anon, authenticated;

-- =========================================================
-- TRIGGER: create profile on new user, promote first user
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count int;
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email);

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- user_roles
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "no client insert on user_roles" ON public.user_roles;
CREATE POLICY "no client insert on user_roles" ON public.user_roles
  FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "no client update on user_roles" ON public.user_roles;
CREATE POLICY "no client update on user_roles" ON public.user_roles
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "no client delete on user_roles" ON public.user_roles;
CREATE POLICY "no client delete on user_roles" ON public.user_roles
  FOR DELETE TO anon, authenticated USING (false);

-- tenants
DROP POLICY IF EXISTS "read own tenant" ON public.tenants;
CREATE POLICY "read own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "owner insert tenant" ON public.tenants;
CREATE POLICY "owner insert tenant" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "admin update tenant" ON public.tenants;
CREATE POLICY "admin update tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "admin delete tenant" ON public.tenants;
CREATE POLICY "admin delete tenant" ON public.tenants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- profiles (THE FIX: tenant-scoped SELECT so members persist after relogin)
DROP POLICY IF EXISTS "read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
DROP POLICY IF EXISTS "Akses Profil Rekan Se-Tenant" ON public.profiles;
CREATE POLICY "profiles tenant scoped select" ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert update policy" ON public.profiles;
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "profiles delete own" ON public.profiles;
CREATE POLICY "profiles delete own" ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'super_admin'));

-- tenant_roles (tenant-scoped)
DROP POLICY IF EXISTS "tenant_roles select" ON public.tenant_roles;
CREATE POLICY "tenant_roles select" ON public.tenant_roles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "tenant_roles insert" ON public.tenant_roles;
CREATE POLICY "tenant_roles insert" ON public.tenant_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "tenant_roles update" ON public.tenant_roles;
CREATE POLICY "tenant_roles update" ON public.tenant_roles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "tenant_roles delete" ON public.tenant_roles;
CREATE POLICY "tenant_roles delete" ON public.tenant_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- licenses
DROP POLICY IF EXISTS "admin manage licenses" ON public.licenses;
CREATE POLICY "admin manage licenses" ON public.licenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- info_posts
DROP POLICY IF EXISTS "read info" ON public.info_posts;
CREATE POLICY "read info" ON public.info_posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage info" ON public.info_posts;
CREATE POLICY "admin manage info" ON public.info_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- categories (tenant-scoped)
DROP POLICY IF EXISTS "categories select" ON public.categories;
CREATE POLICY "categories select" ON public.categories FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "categories insert" ON public.categories;
CREATE POLICY "categories insert" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "categories update" ON public.categories;
CREATE POLICY "categories update" ON public.categories FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "categories delete" ON public.categories;
CREATE POLICY "categories delete" ON public.categories FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- products (tenant-scoped)
DROP POLICY IF EXISTS "products select" ON public.products;
CREATE POLICY "products select" ON public.products FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "products insert" ON public.products;
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "products update" ON public.products;
CREATE POLICY "products update" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "products delete" ON public.products;
CREATE POLICY "products delete" ON public.products FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- transactions (tenant-scoped)
DROP POLICY IF EXISTS "transactions select" ON public.transactions;
CREATE POLICY "transactions select" ON public.transactions FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "transactions insert" ON public.transactions;
CREATE POLICY "transactions insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "transactions update" ON public.transactions;
CREATE POLICY "transactions update" ON public.transactions FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "transactions delete" ON public.transactions;
CREATE POLICY "transactions delete" ON public.transactions FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- transaction_items (tenant-scoped via parent transaction)
DROP POLICY IF EXISTS "transaction_items select" ON public.transaction_items;
CREATE POLICY "transaction_items select" ON public.transaction_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND t.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  ));
DROP POLICY IF EXISTS "transaction_items insert" ON public.transaction_items;
CREATE POLICY "transaction_items insert" ON public.transaction_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND t.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  ));
DROP POLICY IF EXISTS "transaction_items update" ON public.transaction_items;
CREATE POLICY "transaction_items update" ON public.transaction_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND t.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  ));
DROP POLICY IF EXISTS "transaction_items delete" ON public.transaction_items;
CREATE POLICY "transaction_items delete" ON public.transaction_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND t.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  ));

-- cash (tenant-scoped)
DROP POLICY IF EXISTS "cash select" ON public.cash;
CREATE POLICY "cash select" ON public.cash FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "cash insert" ON public.cash;
CREATE POLICY "cash insert" ON public.cash FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "cash update" ON public.cash;
CREATE POLICY "cash update" ON public.cash FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "cash delete" ON public.cash;
CREATE POLICY "cash delete" ON public.cash FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- stock_movements (tenant-scoped)
DROP POLICY IF EXISTS "stock_movements select" ON public.stock_movements;
CREATE POLICY "stock_movements select" ON public.stock_movements FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_movements insert" ON public.stock_movements;
CREATE POLICY "stock_movements insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_movements update" ON public.stock_movements;
CREATE POLICY "stock_movements update" ON public.stock_movements FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_movements delete" ON public.stock_movements;
CREATE POLICY "stock_movements delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON public.transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cash_tenant_id ON public.cash(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON public.stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant_id ON public.tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON public.categories(tenant_id);

NOTIFY pgrst, 'reload schema';
