-- Password reset helper: verify email + license ownership
CREATE OR REPLACE FUNCTION public.verify_license_owner(_email text, _code text)
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
    AND t.license_code = _code
  LIMIT 1;
  RETURN _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_license_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_license_owner(text, text) TO anon, authenticated, service_role;