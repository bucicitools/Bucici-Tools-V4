
-- Lock down SECURITY DEFINER function execution to only the roles that need them.

-- handle_new_user: trigger only, no direct callers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role: used inside RLS policies only, no direct callers
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- has_any_super_admin: called during registration flow by anon
REVOKE ALL ON FUNCTION public.has_any_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_super_admin() TO anon, authenticated;

-- license_available: called during pre-signup check by anon
REVOKE ALL ON FUNCTION public.license_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_available(text) TO anon, authenticated;

-- redeem_license: called by authenticated users only after signup
REVOKE ALL ON FUNCTION public.redeem_license(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_license(text, text, text) TO authenticated;

-- user_roles: explicitly deny any direct client writes; assignments only via
-- handle_new_user trigger (SECURITY DEFINER) or service_role
CREATE POLICY "no client insert on user_roles" ON public.user_roles
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "no client update on user_roles" ON public.user_roles
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client delete on user_roles" ON public.user_roles
  FOR DELETE TO anon, authenticated USING (false);
