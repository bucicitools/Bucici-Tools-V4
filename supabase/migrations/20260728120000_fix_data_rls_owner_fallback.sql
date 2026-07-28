-- Migration: 20260728120000_fix_data_rls_owner_fallback.sql
-- PROBLEM: Products, categories, cash, roles etc disappear after redeploy/relogin.
-- ROOT CAUSE: RLS policies use `tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())`
--   but profiles.tenant_id can be NULL for some owners (especially newly registered).
--   When tenant_id is NULL, the subquery returns {NULL}, and `x IN {NULL}` evaluates to NULL (not TRUE),
--   so ALL writes/reads are silently blocked by RLS. Data never reaches Supabase.
-- FIX: Replace all data-table RLS policies with get_user_tenant_id() SECURITY DEFINER helper
--   which falls back to checking tenants.owner_id when profiles.tenant_id is NULL.
--   This ensures Owners always have access to their tenant's data.

-- Ensure the helper function exists (created in 20260728110000 but re-declare for safety)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.profiles WHERE id = _uid AND tenant_id IS NOT NULL LIMIT 1),
    (SELECT id FROM public.tenants WHERE owner_id = _uid LIMIT 1)
  );
$$;

-- =========================================================
-- PRODUCTS
-- =========================================================
DROP POLICY IF EXISTS "products select" ON public.products;
CREATE POLICY "products select" ON public.products FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "products insert" ON public.products;
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "products update" ON public.products;
CREATE POLICY "products update" ON public.products FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "products delete" ON public.products;
CREATE POLICY "products delete" ON public.products FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- CATEGORIES
-- =========================================================
DROP POLICY IF EXISTS "categories select" ON public.categories;
CREATE POLICY "categories select" ON public.categories FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "categories insert" ON public.categories;
CREATE POLICY "categories insert" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "categories update" ON public.categories;
CREATE POLICY "categories update" ON public.categories FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "categories delete" ON public.categories;
CREATE POLICY "categories delete" ON public.categories FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- TENANT ROLES
-- =========================================================
DROP POLICY IF EXISTS "tenant_roles select" ON public.tenant_roles;
CREATE POLICY "tenant_roles select" ON public.tenant_roles FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "tenant_roles insert" ON public.tenant_roles;
CREATE POLICY "tenant_roles insert" ON public.tenant_roles FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "tenant_roles update" ON public.tenant_roles;
CREATE POLICY "tenant_roles update" ON public.tenant_roles FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "tenant_roles delete" ON public.tenant_roles;
CREATE POLICY "tenant_roles delete" ON public.tenant_roles FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- TRANSACTIONS
-- =========================================================
DROP POLICY IF EXISTS "transactions select" ON public.transactions;
CREATE POLICY "transactions select" ON public.transactions FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "transactions insert" ON public.transactions;
CREATE POLICY "transactions insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "transactions update" ON public.transactions;
CREATE POLICY "transactions update" ON public.transactions FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "transactions delete" ON public.transactions;
CREATE POLICY "transactions delete" ON public.transactions FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- TRANSACTION ITEMS (via parent transaction's tenant)
-- =========================================================
DROP POLICY IF EXISTS "transaction_items select" ON public.transaction_items;
CREATE POLICY "transaction_items select" ON public.transaction_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR public.has_role(auth.uid(), 'super_admin')
      )
  ));

DROP POLICY IF EXISTS "transaction_items insert" ON public.transaction_items;
CREATE POLICY "transaction_items insert" ON public.transaction_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR public.has_role(auth.uid(), 'super_admin')
      )
  ));

DROP POLICY IF EXISTS "transaction_items update" ON public.transaction_items;
CREATE POLICY "transaction_items update" ON public.transaction_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR public.has_role(auth.uid(), 'super_admin')
      )
  ));

DROP POLICY IF EXISTS "transaction_items delete" ON public.transaction_items;
CREATE POLICY "transaction_items delete" ON public.transaction_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR public.has_role(auth.uid(), 'super_admin')
      )
  ));

-- =========================================================
-- CASH
-- =========================================================
DROP POLICY IF EXISTS "cash select" ON public.cash;
CREATE POLICY "cash select" ON public.cash FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "cash insert" ON public.cash;
CREATE POLICY "cash insert" ON public.cash FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "cash update" ON public.cash;
CREATE POLICY "cash update" ON public.cash FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "cash delete" ON public.cash;
CREATE POLICY "cash delete" ON public.cash FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- STOCK MOVEMENTS
-- =========================================================
DROP POLICY IF EXISTS "stock_movements select" ON public.stock_movements;
CREATE POLICY "stock_movements select" ON public.stock_movements FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "stock_movements insert" ON public.stock_movements;
CREATE POLICY "stock_movements insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "stock_movements update" ON public.stock_movements;
CREATE POLICY "stock_movements update" ON public.stock_movements FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "stock_movements delete" ON public.stock_movements;
CREATE POLICY "stock_movements delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Backfill profiles.tenant_id for owners whose profile has NULL tenant_id
UPDATE public.profiles p
SET tenant_id = t.id
FROM public.tenants t
WHERE t.owner_id = p.id
  AND p.tenant_id IS NULL;

NOTIFY pgrst, 'reload schema';
