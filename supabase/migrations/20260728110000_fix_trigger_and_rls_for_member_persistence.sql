-- Migration: 20260728110000_fix_trigger_and_rls_for_member_persistence.sql
-- Fixes member persistence after relogin by ensuring trigger populates tenant_id & role_id
-- and updating RLS policies with a SECURITY DEFINER helper function.

-- 1. SECURITY DEFINER helper to get tenant_id for any user without RLS recursion
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

-- 2. Enhanced handle_new_user trigger function that reads raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count int;
  meta_tenant_id text;
  meta_role_id text;
  tid uuid;
BEGIN
  meta_tenant_id := NEW.raw_user_meta_data->>'tenant_id';
  meta_role_id := NEW.raw_user_meta_data->>'role_id';

  IF meta_tenant_id IS NOT NULL AND meta_tenant_id != '' THEN
    BEGIN
      tid := meta_tenant_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      tid := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, name, email, tenant_id, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    tid,
    meta_role_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id),
    role_id = COALESCE(public.profiles.role_id, EXCLUDED.role_id);

  -- Insert user_roles if meta specifies role
  IF (NEW.raw_user_meta_data->>'role') = 'member' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'member')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Backfill profiles that have NULL tenant_id from auth.users meta
UPDATE public.profiles p
SET
  tenant_id = CASE
    WHEN p.tenant_id IS NULL AND u.raw_user_meta_data->>'tenant_id' IS NOT NULL AND u.raw_user_meta_data->>'tenant_id' != ''
    THEN (u.raw_user_meta_data->>'tenant_id')::uuid
    ELSE p.tenant_id
  END,
  role_id = COALESCE(p.role_id, u.raw_user_meta_data->>'role_id')
FROM auth.users u
WHERE p.id = u.id;

-- 4. RLS POLICIES FOR PROFILES
DROP POLICY IF EXISTS "profiles tenant scoped select" ON public.profiles;
DROP POLICY IF EXISTS "read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;

CREATE POLICY "profiles tenant scoped select" ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_user_tenant_id(auth.uid())
    OR id = (SELECT owner_id FROM public.tenants WHERE id = public.get_user_tenant_id(auth.uid()))
  );

DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "profiles insert tenant" ON public.profiles;

CREATE POLICY "profiles insert tenant" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles update tenant" ON public.profiles;

CREATE POLICY "profiles update tenant" ON public.profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  )
  WITH CHECK (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

DROP POLICY IF EXISTS "profiles delete own" ON public.profiles;
DROP POLICY IF EXISTS "profiles delete tenant" ON public.profiles;

CREATE POLICY "profiles delete tenant" ON public.profiles FOR DELETE TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );
