begin;

create or replace function public.admin_save_menu_item(item_id uuid, expected_updated_at timestamptz, item_values jsonb, group_ids uuid[])
returns public.menu_items
language plpgsql security invoker set search_path = '' as $$
declare
  supplied public.menu_items%rowtype;
  saved public.menu_items%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if item_values is null or jsonb_typeof(item_values) <> 'object' then raise exception 'Invalid menu item'; end if;
  if exists (select 1 from jsonb_object_keys(item_values) as supplied_key(value) where value not in (
    'category_id', 'name', 'slug', 'description', 'price_pence', 'image_path', 'image_alt',
    'dietary_tags', 'allergens', 'allergen_note', 'is_published', 'is_available', 'is_featured', 'is_crowd_favourite'
  )) then raise exception 'Unsupported menu item field'; end if;
  supplied := jsonb_populate_record(null::public.menu_items, item_values);
  if item_id is null then
    insert into public.menu_items (category_id, name, slug, description, price_pence, image_path, image_alt,
      dietary_tags, allergens, allergen_note, is_published, is_available, is_featured, is_crowd_favourite)
    values (supplied.category_id, supplied.name, supplied.slug, supplied.description, supplied.price_pence, supplied.image_path, supplied.image_alt,
      supplied.dietary_tags, supplied.allergens, supplied.allergen_note, supplied.is_published, supplied.is_available, supplied.is_featured, supplied.is_crowd_favourite)
    returning * into saved;
  else
    select * into saved from public.menu_items where id = item_id for update;
    if not found then raise exception 'Item not found'; end if;
    if saved.updated_at is distinct from expected_updated_at then raise exception 'Item changed; refresh before saving'; end if;
    update public.menu_items set category_id = supplied.category_id, name = supplied.name, slug = supplied.slug,
      description = supplied.description, price_pence = supplied.price_pence, image_path = supplied.image_path, image_alt = supplied.image_alt,
      dietary_tags = supplied.dietary_tags, allergens = supplied.allergens, allergen_note = supplied.allergen_note,
      is_published = supplied.is_published, is_available = supplied.is_available, is_featured = supplied.is_featured,
      is_crowd_favourite = supplied.is_crowd_favourite
    where id = item_id returning * into saved;
  end if;
  perform public.admin_assign_modifier_groups(saved.id, group_ids, saved.updated_at);
  select * into saved from public.menu_items where id = saved.id;
  return saved;
end;
$$;

revoke all on function public.admin_save_menu_item(uuid, timestamptz, jsonb, uuid[]) from public, anon;
grant execute on function public.admin_save_menu_item(uuid, timestamptz, jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;