begin;

create or replace function public.admin_save_homepage_featured_menu(
  expected_version timestamptz,
  papas_choice_ids uuid[],
  crowd_favourite_ids uuid[]
)
returns table(updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
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

  lock table public.menu_categories, public.menu_items in share row exclusive mode;
  if exists (
    select 1
    from unnest(array_cat(papas_choice_ids, crowd_favourite_ids)) selected(item_id)
    where not exists (
      select 1
      from public.menu_items item
      join public.menu_categories category on category.id = item.category_id
      where item.id = selected.item_id
        and item.is_published and item.archived_at is null
        and category.is_published
    )
  ) then raise exception 'Choose published menu items in a published category'; end if;

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

notify pgrst, 'reload schema';
commit;
