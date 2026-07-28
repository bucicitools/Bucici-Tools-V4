-- Migration: 20260728100000_fix_owner_and_member_rls.sql
-- Enables Tenant Owners to SELECT, UPDATE, DELETE profiles in their tenant,
-- and enables Members to SELECT their tenant from tenants table.

-- 1. PROFILES SELECT: tenant scoped with owner fallback
DROP POLICY IF EXISTS "profiles tenant scoped select" ON public.profiles;
CREATE POLICY "profiles tenant scoped select" ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

-- 2. PROFILES UPDATE: owner or self or super_admin
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles update tenant" ON public.profiles;
CREATE POLICY "profiles update tenant" ON public.profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

-- 3. PROFILES DELETE: owner or self or super_admin
DROP POLICY IF EXISTS "profiles delete own" ON public.profiles;
DROP POLICY IF EXISTS "profiles delete tenant" ON public.profiles;
CREATE POLICY "profiles delete tenant" ON public.profiles FOR DELETE TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

-- 4. TENANTS SELECT: members can select their tenant
DROP POLICY IF EXISTS "read own tenant" ON public.tenants;
CREATE POLICY "read own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'super_admin')
    OR id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL)
  );

-- 5. TENANT_ROLES: tenant-scoped
DROP POLICY IF EXISTS "tenant_roles select" ON public.tenant_roles;
CREATE POLICY "tenant_roles select" ON public.tenant_roles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_roles insert" ON public.tenant_roles;
CREATE POLICY "tenant_roles insert" ON public.tenant_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_roles update" ON public.tenant_roles;
CREATE POLICY "tenant_roles update" ON public.tenant_roles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_roles delete" ON public.tenant_roles;
CREATE POLICY "tenant_roles delete" ON public.tenant_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL
      UNION
      SELECT id FROM public.tenants WHERE owner_id = auth.uid()
    )
  );
