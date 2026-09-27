begin;

do $$
declare
  definition text;
  previous_guard text := 'settings.singleton is null or settings.maintenance_enabled or not settings.card_enabled';
  admin_guard text := 'settings.singleton is null or (settings.maintenance_enabled and not exists (select 1 from public.profiles where id = customer_uuid and role = ''admin'')) or not settings.card_enabled';
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('private.quote_modifier_choices' in definition) = 0 then
    raise exception 'Apply 036_nested_modifier_checkout.sql before 037';
  end if;
  if position(admin_guard in definition) > 0 then
    return;
  end if;
  if position(previous_guard in definition) = 0 then
    raise exception 'Unexpected checkout function: review the maintenance guard before applying 037';
  end if;
  execute replace(definition, previous_guard, admin_guard);
end;
$$;

revoke all on function public.reserve_card_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_card_order(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;