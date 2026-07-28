CREATE OR REPLACE FUNCTION public.verify_license_owner(_email text, _code text, _business_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT p.id INTO _uid
  FROM public.profiles p
  JOIN public.tenants t ON t.owner_id = p.id
  WHERE lower(p.email) = lower(_email)
    AND upper(t.license_code) = upper(_code)
    AND lower(t.business_name) = lower(_business_name)
  LIMIT 1;
  RETURN _uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_license_owner(text, text, text) TO anon, authenticated;