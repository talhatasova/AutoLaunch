-- Advisor fix: anon_security_definer_function_executable /
--               authenticated_security_definer_function_executable
--
-- public.rls_auto_enable() is a pre-existing SECURITY DEFINER function backing
-- the `ensure_rls` event trigger, which auto-enables RLS on any new table in
-- public. It is a guard rail, not an API.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, and anon
-- and authenticated inherit from PUBLIC, so it was reachable at
-- /rest/v1/rpc/rls_auto_enable. Event triggers are fired by the server itself
-- and do not consult EXECUTE privileges, so revoking costs nothing.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
