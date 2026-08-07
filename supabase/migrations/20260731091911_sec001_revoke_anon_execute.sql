-- Defense en profondeur. L'ACL montrait '=X/postgres' : EXECUTE etait accorde a
-- PUBLIC, donc revoquer seulement 'anon' aurait ete inoperant (anon herite via PUBLIC).
REVOKE ALL ON FUNCTION public.get_admin_users_list(integer, integer)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_prompt_history(integer)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_token_usage()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_stats()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_top_tools()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_top_styles(integer)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_provider_config(text, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_paint(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_import_paints(jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_paint(uuid, jsonb)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_admin_users_list(integer, integer)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_prompt_history(integer)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_token_usage()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_top_tools()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_top_styles(integer)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_provider_config(text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_paint(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_paints(jsonb, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_paint(uuid, jsonb)           TO authenticated, service_role;

-- SEC-007 : figer le search_path de la derniere fonction SECURITY DEFINER qui en manque
ALTER FUNCTION public.get_provider_config() SET search_path = public;;
