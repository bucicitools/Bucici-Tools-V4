
-- Ensure RLS policies that call has_role() can evaluate for logged-in users.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_any_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_license(text, text, text) TO authenticated;

-- Re-affirm safe search_path on SECURITY DEFINER functions (linter hardening).
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.has_any_super_admin() SET search_path = public;
ALTER FUNCTION public.license_available(text) SET search_path = public;
ALTER FUNCTION public.redeem_license(text, text, text) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Make sure authenticated role can read its own rows (idempotent re-affirm).
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
