-- Extend verify_license_owner to also match tenant business_name.
CREATE OR REPLACE FUNCTION public.verify_license_owner(_email text, _code text, _business_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Drop the old 2-arg variant so PostgREST resolves the new 3-arg one unambiguously.
DROP FUNCTION IF EXISTS public.verify_license_owner(text, text);

REVOKE ALL ON FUNCTION public.verify_license_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_license_owner(text, text, text) TO anon, authenticated;