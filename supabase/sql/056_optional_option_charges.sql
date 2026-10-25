begin;

lock table public.modifier_groups, public.modifier_options in share row exclusive mode;

alter table public.order_item_modifiers
  drop constraint removal_snapshot_values,
  add constraint removal_snapshot_values check (
    group_type <> 'removal' or (linked_menu_item_id is null and cardinality(allergen_snapshot) = 0)
  );

create or replace function private.validate_removal_groups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.modifier_groups parent
    join public.modifier_groups child on child.id = any(parent.child_group_ids)
    where child.group_type = 'removal'
  ) then raise exception 'Removals and Other Options groups must be attached directly to menu items, not nested inside other groups'; end if;
  if exists (
    select 1 from public.modifier_options o join public.modifier_groups g on g.id = o.modifier_group_id
    where g.group_type = 'removal' and (
      o.linked_menu_item_id is not null or o.pricing_mode <> 'extra'
      or o.linked_quantity <> 1 or cardinality(o.allergens) <> 0
    )
  ) then raise exception 'Removals and Other Options must be unlinked choices with no added allergens'; end if;
  if exists (
    select 1 from public.modifier_groups g join public.modifier_options o on o.modifier_group_id = g.id
    where g.group_type = 'removal' group by g.id having count(*) > 30
  ) then raise exception 'A Removals and Other Options group can contain at most 30 options'; end if;
  return null;
end;
$$;
revoke all on function private.validate_removal_groups() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
