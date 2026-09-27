begin;
do $$
declare
  definition text;
  admin_guard text := 'settings.singleton is null or (settings.maintenance_enabled and not exists (select 1 from public.profiles where id = customer_uuid and role = ''admin'')) or not settings.card_enabled';
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position(admin_guard in definition) > 0 then
    execute replace(definition, admin_guard, 'settings.singleton is null or settings.maintenance_enabled or not settings.card_enabled');
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;