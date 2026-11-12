begin;

do $$
declare
  initialize_selections boolean;
  default_menu uuid;
  papa_ids uuid[] := '{}';
  crowd_ids uuid[] := '{}';
begin
  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_settings' and column_name = 'homepage_papas_choice_ids'
  ) into initialize_selections;

  alter table public.business_settings
    add column if not exists homepage_papas_choice_ids uuid[] not null default '{}',
    add column if not exists homepage_crowd_favourite_ids uuid[] not null default '{}';

  if initialize_selections then
    select id into default_menu from public.menu_sets where is_default;
    if default_menu is not null then
      select coalesce(array_agg(selected.id order by selected.position), '{}')
        into papa_ids
      from (
        select item.id, row_number() over (order by section.sort_order, section.id, entry.sort_order, item.id) as position
        from public.menu_set_items entry
        join public.menu_set_sections section on section.id = entry.section_id and section.menu_set_id = entry.menu_set_id
        join public.menu_items item on item.id = entry.menu_item_id
        where entry.menu_set_id = default_menu
          and item.is_published and item.archived_at is null and item.show_standalone
          and item.is_featured
        order by section.sort_order, section.id, entry.sort_order, item.id
        limit 3
      ) selected;

      select coalesce(array_agg(selected.id order by selected.position), '{}')
        into crowd_ids
      from (
        select item.id, row_number() over (order by section.sort_order, section.id, entry.sort_order, item.id) as position
        from public.menu_set_items entry
        join public.menu_set_sections section on section.id = entry.section_id and section.menu_set_id = entry.menu_set_id
        join public.menu_items item on item.id = entry.menu_item_id
        where entry.menu_set_id = default_menu
          and item.is_published and item.archived_at is null and item.show_standalone
          and item.is_crowd_favourite
          and not (item.id = any(papa_ids))
        order by section.sort_order, section.id, entry.sort_order, item.id
        limit 3
      ) selected;
    end if;

    update public.business_settings
    set homepage_papas_choice_ids = papa_ids,
        homepage_crowd_favourite_ids = crowd_ids;
  end if;
end;
$$;

alter table public.business_settings
  drop constraint if exists business_settings_homepage_papas_choice_limit,
  add constraint business_settings_homepage_papas_choice_limit
    check (cardinality(homepage_papas_choice_ids) <= 3),
  drop constraint if exists business_settings_homepage_crowd_favourite_limit,
  add constraint business_settings_homepage_crowd_favourite_limit
    check (cardinality(homepage_crowd_favourite_ids) <= 3),
  drop constraint if exists business_settings_homepage_featured_items_unique,
  add constraint business_settings_homepage_featured_items_unique
    check (not (homepage_papas_choice_ids && homepage_crowd_favourite_ids));

create or replace function public.admin_save_homepage_featured_menu(
  expected_version timestamptz,
  papas_choice_ids uuid[],
  crowd_favourite_ids uuid[]
)
returns table(updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  default_menu uuid;
  saved_version timestamptz;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if expected_version is null or papas_choice_ids is null or crowd_favourite_ids is null
    or cardinality(papas_choice_ids) > 3 or cardinality(crowd_favourite_ids) > 3
    or cardinality(papas_choice_ids) <> (select count(distinct selected.item_id) from unnest(papas_choice_ids) as selected(item_id))
    or cardinality(crowd_favourite_ids) <> (select count(distinct selected.item_id) from unnest(crowd_favourite_ids) as selected(item_id))
    or papas_choice_ids && crowd_favourite_ids then
    raise exception 'Choose up to three distinct items for each homepage section without duplicates';
  end if;

  lock table public.menu_sets, public.menu_set_sections, public.menu_set_items, public.menu_items in share row exclusive mode;
  select id into default_menu from public.menu_sets where is_default;
  if default_menu is null then raise exception 'Set a Default Public Menu before choosing homepage items'; end if;
  if exists (
    select 1
    from unnest(array_cat(papas_choice_ids, crowd_favourite_ids)) selected(item_id)
    where not exists (
      select 1
      from public.menu_set_items entry
      join public.menu_set_sections section on section.id = entry.section_id and section.menu_set_id = entry.menu_set_id
      join public.menu_items item on item.id = entry.menu_item_id
      where entry.menu_set_id = default_menu
        and entry.menu_item_id = selected.item_id
        and item.is_published and item.archived_at is null and item.show_standalone
    )
  ) then raise exception 'Choose published, standalone items from the current Default Public Menu'; end if;

  update public.business_settings
  set homepage_papas_choice_ids = papas_choice_ids,
      homepage_crowd_favourite_ids = crowd_favourite_ids
  where business_settings.singleton and business_settings.updated_at = expected_version
  returning business_settings.updated_at into saved_version;
  if not found then raise exception 'Homepage menu settings changed. Refresh and try again'; end if;
  return query select saved_version;
end;
$$;
revoke all on function public.admin_save_homepage_featured_menu(timestamptz, uuid[], uuid[]) from public;
grant execute on function public.admin_save_homepage_featured_menu(timestamptz, uuid[], uuid[]) to authenticated;

create or replace view public.admin_business_settings
with (security_invoker = true, security_barrier = true) as
  select * from public.business_settings
  where (select private.is_admin())
  with cascaded check option;

revoke all on public.admin_business_settings from public, anon, authenticated;
grant select, update on public.admin_business_settings to authenticated;

notify pgrst, 'reload schema';
commit;
