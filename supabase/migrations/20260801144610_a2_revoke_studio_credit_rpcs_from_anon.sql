do $$
declare
  fn text;
  signatures text[] := array[
    'public.reserve_generation(uuid, integer)',
    'public.reserve_generation(uuid, integer, text)',
    'public.reserve_generation(uuid, integer, text, jsonb)',
    'public.confirm_generation(uuid, text, text)',
    'public.confirm_generation(uuid, text, text, text)',
    'public.confirm_generation(uuid, text, text, text, integer, integer)',
    'public.confirm_generation(uuid, text, text, text, integer, integer, text)',
    'public.release_generation(uuid, text)',
    'public.get_usage_stats(uuid)',
    'public.get_monthly_usage(uuid)',
    'public.get_monthly_flash_usage(uuid)'
  ];
begin
  foreach fn in array signatures loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;;
