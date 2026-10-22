begin;

create table if not exists public.menu_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index if not exists menu_sets_one_default on public.menu_sets(is_default) where is_default;
create table if not exists public.menu_set_sections (
  id uuid primary key default gen_random_uuid(),
  menu_set_id uuid not null references public.menu_sets(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  sort_order integer not null default 0
);
create table if not exists public.menu_set_items (
  menu_set_id uuid not null references public.menu_sets(id) on delete cascade,
  section_id uuid not null references public.menu_set_sections(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  sort_order integer not null default 0,
  price_pence integer check (price_pence between 0 and 100000),
  primary key (menu_set_id, menu_item_id)
);
alter table public.events add column if not exists menu_set_id uuid references public.menu_sets(id);

create or replace function private.guard_menu_set_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.menu_set_sections where id = new.section_id and menu_set_id = new.menu_set_id) then
    raise exception 'Section does not belong to this menu set';
  end if;
  return new;
end;
$$;
drop trigger if exists menu_set_item_section on public.menu_set_items;
create trigger menu_set_item_section before insert or update on public.menu_set_items
for each row execute function private.guard_menu_set_item();
drop trigger if exists menu_sets_updated_at on public.menu_sets;
create trigger menu_sets_updated_at before update on public.menu_sets
for each row execute function private.set_updated_at();

do $$
declare table_name text; default_id uuid; category record; section_id uuid;
begin
  foreach table_name in array array['menu_sets','menu_set_sections','menu_set_items'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('drop policy if exists menu_set_read on public.%I', table_name);
    execute format('create policy menu_set_read on public.%I for select to anon, authenticated using (true)', table_name);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
  if not exists (select 1 from public.menu_sets where is_default) then
    insert into public.menu_sets(name,is_default) values ('Public Menu',true) returning id into default_id;
    for category in select * from public.menu_categories where is_published order by sort_order,id loop
      insert into public.menu_set_sections(menu_set_id,title,sort_order) values (default_id,category.name,category.sort_order) returning id into section_id;
      insert into public.menu_set_items(menu_set_id,section_id,menu_item_id,sort_order)
      select default_id,section_id,id,sort_order from public.menu_items
      where category_id=category.id and is_published and archived_at is null;
    end loop;
  end if;
end;
$$;

create or replace function public.admin_save_menu_set(set_uuid uuid, expected_version timestamptz, set_name text, sections jsonb)
returns public.menu_sets language plpgsql security definer set search_path = '' as $$
declare saved public.menu_sets%rowtype; section jsonb; entry jsonb; section_uuid uuid; position integer := 0; item_position integer;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if char_length(trim(coalesce(set_name,''))) not between 1 and 120
    or jsonb_typeof(sections) is distinct from 'array' or jsonb_array_length(sections)>50 then raise exception 'Invalid menu set'; end if;
  lock table public.menu_sets, public.menu_set_sections, public.menu_set_items in share row exclusive mode;
  if set_uuid is null then
    insert into public.menu_sets(name) values (trim(set_name)) returning * into saved;
  else
    select * into saved from public.menu_sets where id=set_uuid for update;
    if not found or saved.updated_at is distinct from expected_version then raise exception 'Menu set changed; refresh before saving'; end if;
    update public.menu_sets set name=trim(set_name) where id=set_uuid returning * into saved;
    delete from public.menu_set_sections where menu_set_id=set_uuid;
  end if;
  for section in select value from jsonb_array_elements(sections) loop
    if char_length(trim(coalesce(section->>'title',''))) not between 1 and 120
      or jsonb_typeof(section->'items') is distinct from 'array' or jsonb_array_length(section->'items')>500 then raise exception 'Invalid menu section'; end if;
    insert into public.menu_set_sections(menu_set_id,title,sort_order)
    values(saved.id,trim(section->>'title'),position) returning id into section_uuid;
    position := position+1;
    item_position := 0;
    for entry in select value from jsonb_array_elements(section->'items') loop
      if not exists (select 1 from public.menu_items where id=(entry->>'itemId')::uuid and archived_at is null) then raise exception 'A menu item was removed or archived. Refresh before saving'; end if;
      insert into public.menu_set_items(menu_set_id,section_id,menu_item_id,sort_order,price_pence)
      values(saved.id,section_uuid,(entry->>'itemId')::uuid,item_position,(entry->>'pricePence')::integer);
      item_position := item_position+1;
    end loop;
  end loop;
  return saved;
end;
$$;
revoke all on function public.admin_save_menu_set(uuid,timestamptz,text,jsonb) from public;
grant execute on function public.admin_save_menu_set(uuid,timestamptz,text,jsonb) to authenticated;

create or replace function private.menu_set_price(event_uuid uuid, item_uuid uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare result integer;
begin
  select coalesce(entry.price_pence,item.price_pence) into result
  from public.menu_set_items entry join public.menu_items item on item.id=entry.menu_item_id
  where entry.menu_item_id=item_uuid and entry.menu_set_id=coalesce(
    (select menu_set_id from public.events where id=event_uuid),
    (select id from public.menu_sets where is_default));
  if not found then raise exception 'An item is not on the menu for this event. Review your bag.'; end if;
  return result;
end;
$$;
revoke all on function private.menu_set_price(uuid,uuid) from public, anon, authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('private.menu_set_price' in definition)=0 then
    if position('choices := private.quote_modifier_choices' in definition)=0 then raise exception 'Unexpected checkout function. Apply migrations through 047 first'; end if;
    definition := replace(definition, 'choices := private.quote_modifier_choices',
      'item_record.price_pence := private.menu_set_price(
        case when nullif(payload->>''slotId'', '''') is not null then
          (select event_id from public.pickup_slots where id=(payload->>''slotId'')::uuid)
        else (payload->>''eventId'')::uuid end, item_record.id);
    choices := private.quote_modifier_choices');
    definition := replace(definition, 'lock table public.menu_categories, public.menu_items, public.modifier_groups,',
      'lock table public.menu_sets, public.menu_set_sections, public.menu_set_items in share mode;
  lock table public.events in share mode;
  lock table public.menu_categories, public.menu_items, public.modifier_groups,');
    execute definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
