
-- 1) Public license availability precheck (no data exposure)
CREATE OR REPLACE FUNCTION public.license_available(_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.licenses WHERE code = _code AND used = false);
$$;
GRANT EXECUTE ON FUNCTION public.license_available(text) TO anon, authenticated;

-- 2) Atomic redeem-license: creates tenant, attaches profile, marks license used
CREATE OR REPLACE FUNCTION public.redeem_license(_code text, _business_name text, _owner_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;
GRANT EXECUTE ON FUNCTION public.redeem_license(text, text, text) TO authenticated;

-- 3) Tighten RLS on licenses: no direct read/update for regular users; admins retain full access via existing "admin manage licenses"
DROP POLICY IF EXISTS "read license by code" ON public.licenses;
DROP POLICY IF EXISTS "consume license" ON public.licenses;

-- 4) Tighten tenants: only owner or super-admin can read
DROP POLICY IF EXISTS "auth read tenants" ON public.tenants;
CREATE POLICY "read own tenant" ON public.tenants FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
