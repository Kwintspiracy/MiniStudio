CREATE OR REPLACE FUNCTION public.get_admin_prompt_history(p_limit integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC) INTO v_rows
  FROM (SELECT id, created_at, model_used, action_type, cost_units, input_tokens, output_tokens,
               LEFT(prompt, 500) AS prompt_preview, char_length(prompt) AS prompt_length
        FROM public.generation_logs ORDER BY created_at DESC LIMIT p_limit) r;
  RETURN jsonb_build_object('success', true, 'entries', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_token_usage()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_total_input bigint; v_total_output bigint; v_today_input bigint;
        v_today_output bigint; v_gen_count bigint; v_daily jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COUNT(*)
    INTO v_total_input, v_total_output, v_gen_count
    FROM public.generation_logs WHERE input_tokens IS NOT NULL;
  SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
    INTO v_today_input, v_today_output
    FROM public.generation_logs WHERE input_tokens IS NOT NULL AND created_at >= date_trunc('day', now());
  SELECT jsonb_agg(row_to_json(d) ORDER BY d.day DESC) INTO v_daily
  FROM (SELECT date_trunc('day', created_at)::date AS day,
               COALESCE(SUM(input_tokens),0) AS input_tokens,
               COALESCE(SUM(output_tokens),0) AS output_tokens, COUNT(*) AS generations
        FROM public.generation_logs
        WHERE input_tokens IS NOT NULL AND created_at >= now() - interval '7 days'
        GROUP BY date_trunc('day', created_at)::date ORDER BY day DESC) d;
  RETURN jsonb_build_object('success', true,
    'total_input_tokens', v_total_input, 'total_output_tokens', v_total_output,
    'total_generations_tracked', v_gen_count, 'today_input_tokens', v_today_input,
    'today_output_tokens', v_today_output,
    'avg_input_tokens', CASE WHEN v_gen_count > 0 THEN (v_total_input / v_gen_count) ELSE 0 END,
    'daily_breakdown', COALESCE(v_daily, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_top_tools()
 RETURNS TABLE(tool_name text, usage_count integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  WITH tool_list AS (SELECT jsonb_array_elements_text(metadata->'effects') as tool
                     FROM public.generation_jobs
                     WHERE status = 'completed' AND metadata->'effects' IS NOT NULL)
  SELECT tool as tool_name, count(*)::int as usage_count FROM tool_list GROUP BY 1 ORDER BY 2 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_provider_config(p_key text, p_value text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_key NOT IN ('primary_provider', 'fallback_enabled', 'poyo_model') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;
  IF p_key = 'primary_provider' AND p_value NOT IN ('poyo', 'google') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'primary_provider must be poyo or google');
  END IF;
  IF p_key = 'fallback_enabled' AND p_value NOT IN ('true', 'false') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'fallback_enabled must be true or false');
  END IF;
  IF p_key = 'poyo_model' AND p_value NOT IN (
    'nano-banana-2','nano-banana-2-edit','nano-banana-pro','nano-banana-pro-edit',
    'nano-banana','nano-banana-edit','seedream-4.5','seedream-4.5-edit',
    'seedream-4','seedream-4-edit','flux-kontext-pro','flux-kontext-pro-edit',
    'flux-kontext-max','flux-kontext-max-edit','gpt-image-2','gpt-image-2-edit',
    'wan-2.7-image','z-image') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value', 'message', 'unknown poyo_model');
  END IF;
  UPDATE public.app_config SET value_text = p_value WHERE key = p_key;
  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$function$;;
