create schema if not exists private;

comment on schema private is
  'Objets qui ne doivent JAMAIS etre exposes par PostgREST. Accessibles au service_role et aux fonctions SECURITY DEFINER uniquement. Ne pas ajouter ce schema aux "Exposed schemas" de la console.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

alter table public.poyo_api_keys set schema private;

revoke all on table private.poyo_api_keys from anon, authenticated;
revoke all on table private.poyo_api_keys from public;

create or replace function public.get_available_poyo_key()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_key record;
  v_current_minute timestamptz;
BEGIN
  v_current_minute := date_trunc('minute', now());

  UPDATE private.poyo_api_keys
  SET requests_this_minute = 0, minute_window = v_current_minute
  WHERE minute_window < v_current_minute AND is_active = true;

  SELECT * INTO v_key
  FROM private.poyo_api_keys
  WHERE is_active = true
    AND (minute_window < v_current_minute OR requests_this_minute < 5)
  ORDER BY requests_this_minute ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_keys_available');
  END IF;

  UPDATE private.poyo_api_keys
  SET
    requests_this_minute = CASE
      WHEN minute_window < v_current_minute THEN 1
      ELSE requests_this_minute + 1
    END,
    minute_window = v_current_minute
  WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'success', true,
    'api_key', v_key.api_key,
    'requests_used', v_key.requests_this_minute + 1
  );
END;
$function$;

revoke all on function public.get_available_poyo_key() from public;
revoke all on function public.get_available_poyo_key() from anon, authenticated;
grant execute on function public.get_available_poyo_key() to service_role;;
