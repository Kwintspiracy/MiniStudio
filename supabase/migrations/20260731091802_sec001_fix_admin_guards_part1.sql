CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_total_users int; v_anon_users int; v_account_users int;
        v_total_generations int; v_success_generations int; v_today_generations int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT count(*) INTO v_total_users FROM auth.users;
  SELECT count(*) INTO v_anon_users FROM auth.users
   WHERE (raw_user_meta_data->>'is_anonymous')::boolean = true OR email IS NULL OR email LIKE '%@anon.%';
  v_account_users := v_total_users - v_anon_users;
  SELECT count(*) INTO v_total_generations FROM public.generation_jobs;
  SELECT count(*) INTO v_success_generations FROM public.generation_jobs WHERE status = 'completed';
  SELECT count(*) INTO v_today_generations FROM public.generation_jobs WHERE created_at >= current_date;
  RETURN jsonb_build_object(
    'users', jsonb_build_object('total', v_total_users, 'anonymous', v_anon_users, 'accounts', v_account_users),
    'generations', jsonb_build_object('total', v_total_generations, 'success', v_success_generations, 'today', v_today_generations));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_users_list(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, is_anonymous boolean, created_at timestamp with time zone, generation_count integer, last_generation_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email,
    COALESCE((u.raw_user_meta_data->>'is_anonymous')::boolean, u.email IS NULL OR u.email LIKE '%@anon.%') as is_anonymous,
    u.created_at,
    (SELECT count(*)::int FROM public.generation_jobs gj WHERE gj.user_id = u.id) as generation_count,
    (SELECT max(gj.created_at) FROM public.generation_jobs gj WHERE gj.user_id = u.id) as last_generation_at
  FROM auth.users u ORDER BY u.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_top_styles(p_limit integer DEFAULT 10)
 RETURNS TABLE(style_name text, usage_count integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT COALESCE(metadata->>'style_name', 'Unknown') as style_name, count(*)::int as usage_count
  FROM public.generation_jobs
  WHERE status = 'completed' AND metadata->>'style_name' IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit;
END;
$function$;;
