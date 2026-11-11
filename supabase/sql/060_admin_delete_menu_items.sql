begin;

alter table public.order_item_modifiers
  drop constraint if exists order_item_modifiers_link_quantity;

do $$
declare inventory_item_menu_fk text;
begin
  select constraint_row.conname into inventory_item_menu_fk
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.inventory_items'::regclass
    and constraint_row.confrelid = 'public.menu_items'::regclass
    and constraint_row.contype = 'f';
  if inventory_item_menu_fk is not null then
    execute format('alter table public.inventory_items drop constraint %I', inventory_item_menu_fk);
  end if;
end;
$$;

do $$
declare definition text; previous_definition text;
begin
  select pg_get_functiondef(
    'public.admin_inventory_action(uuid,uuid,text,integer,bigint,text,text,text,uuid)'::regprocedure
  ) into definition;
  if position('Menu item no longer exists' in definition) = 0 then
    previous_definition := definition;
    definition := replace(definition,
      'if not found then raise exception ''Inventory item not found''; end if;',
      'if not found then raise exception ''Inventory item not found''; end if;
  if not exists (select 1 from public.menu_items where id = item_uuid) then
    raise exception ''Menu item no longer exists'';
  end if;');
    if definition = previous_definition then
      raise exception 'Unexpected inventory action function; cannot guard deleted menu items';
    end if;
    execute definition;
  end if;
end;
$$;

create or replace function private.inventory_protect_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_uuid uuid;
begin
  if tg_op = 'UPDATE'
    and old.menu_item_id is not null and new.menu_item_id is null
    and (new.id, new.order_id, new.item_name, new.quantity, new.unit_price_pence, new.unit_extras_pence,
      new.allergen_snapshot, new.created_at)
      is not distinct from
      (old.id, old.order_id, old.item_name, old.quantity, old.unit_price_pence, old.unit_extras_pence,
      old.allergen_snapshot, old.created_at) then
    if exists (
      select 1 from public.inventory_order_stock stock
      join public.orders order_row on order_row.id = stock.order_id
      where stock.order_id = old.order_id and stock.menu_item_id = old.menu_item_id
        and stock.state = 'held' and (stock.expires_at is null or stock.expires_at > now())
        and order_row.status <> 'cancelled'
    ) then
      raise exception 'Order item inventory snapshots are immutable';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then order_uuid := old.order_id; else order_uuid := new.order_id; end if;
  if exists (select 1 from public.inventory_order_stock where order_id in (order_uuid, old.order_id))
    or exists (select 1 from public.inventory_items where menu_item_id = old.menu_item_id and tracking_mode <> 'none')
    or (tg_op = 'UPDATE' and exists (
      select 1 from public.inventory_items where menu_item_id = new.menu_item_id and tracking_mode <> 'none'
    )) then
    raise exception 'Order item inventory snapshots are immutable';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function private.protect_checkout_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_uuid uuid;
begin
  perform private.inventory_lock();
  if tg_op = 'UPDATE' then
    if tg_table_name = 'order_items' then
      if old.menu_item_id is not null and new.menu_item_id is null
        and (new.id, new.order_id, new.item_name, new.quantity, new.unit_price_pence, new.unit_extras_pence,
          new.allergen_snapshot, new.created_at)
          is not distinct from
          (old.id, old.order_id, old.item_name, old.quantity, old.unit_price_pence, old.unit_extras_pence,
          old.allergen_snapshot, old.created_at) then
          if exists (
            select 1 from public.inventory_order_stock stock
            join public.orders order_row on order_row.id = stock.order_id
            where stock.order_id = old.order_id and stock.menu_item_id = old.menu_item_id
              and stock.state = 'held' and (stock.expires_at is null or stock.expires_at > now())
              and order_row.status <> 'cancelled'
          ) then
            raise exception 'Active inventory commitments prevent unlinking this order item';
          end if;
          return new;
        end if;
    elsif tg_table_name = 'order_item_modifiers' then
      if old.linked_menu_item_id is not null and new.linked_menu_item_id is null
        and (to_jsonb(new) - 'linked_menu_item_id') is not distinct from (to_jsonb(old) - 'linked_menu_item_id') then
        return new;
      end if;
    end if;
  end if;
  if tg_op <> 'INSERT' then raise exception 'Order item inventory snapshots are immutable'; end if;
  if tg_table_name = 'order_items' then
    order_uuid := new.order_id;
  else
    select order_id into order_uuid from public.order_items where id = new.order_item_id;
  end if;
  if not exists (
    select 1 from private.inventory_order_transactions t join public.orders o on o.id = t.order_id
    where t.order_id = order_uuid and t.transaction_id = pg_current_xact_id()
      and o.status in ('pending_payment','ordered') and o.payment_status = 'unpaid'
  ) then raise exception 'Order item inventory snapshots are immutable'; end if;
  return new;
end;
$$;

create or replace function public.admin_delete_menu_item(
  item_uuid uuid,
  expected_updated_at timestamptz,
  override_references boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare current_updated_at timestamptz; has_inventory_history boolean;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if item_uuid is null or expected_updated_at is null or override_references is null then
    raise exception 'Invalid menu item deletion request';
  end if;

  perform private.inventory_lock();
  perform pg_advisory_xact_lock(hashtextextended('modifier-group-nesting', 0));
  select updated_at into current_updated_at from public.menu_items where id = item_uuid for update;
  if not found or current_updated_at is distinct from expected_updated_at then
    raise exception 'This item changed or was removed. Refresh before trying again.' using errcode = 'P0001';
  end if;

  select exists (select 1 from public.inventory_movements where menu_item_id = item_uuid)
    or exists (select 1 from public.inventory_order_stock where menu_item_id = item_uuid)
    into has_inventory_history;
  if has_inventory_history and not override_references then
    raise exception 'This item has inventory history. Confirm Delete & Unlink to retain the inventory audit trail.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.inventory_items where menu_item_id = item_uuid and on_hand > 0)
    or exists (select 1 from public.inventory_allocations where menu_item_id = item_uuid and remaining > 0)
    or exists (
      select 1 from public.inventory_order_stock stock
      join public.orders order_row on order_row.id = stock.order_id
      where stock.menu_item_id = item_uuid and stock.state = 'held'
        and (stock.expires_at is null or stock.expires_at > now())
        and order_row.status <> 'cancelled'
    ) then
    raise exception 'This item still has stock or active commitments. Reconcile or return stock before deleting.' using errcode = 'P0001';
  end if;

  if override_references then
    update public.order_items set menu_item_id = null where menu_item_id = item_uuid;
    update public.order_item_modifiers set linked_menu_item_id = null where linked_menu_item_id = item_uuid;
    update public.modifier_options
      set linked_menu_item_id = null, linked_quantity = 1, pricing_mode = 'extra'
      where linked_menu_item_id = item_uuid;
  end if;

  if has_inventory_history then
    update public.inventory_items set on_hand = 0, version = version + 1
      where menu_item_id = item_uuid;
  else
    delete from public.inventory_allocations where menu_item_id = item_uuid;
    delete from public.inventory_items where menu_item_id = item_uuid;
  end if;
  delete from public.menu_items where id = item_uuid and updated_at = expected_updated_at;
  if not found then
    raise exception 'This item changed or was removed. Refresh before trying again.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.admin_delete_menu_item(uuid, timestamptz, boolean) from public;
grant execute on function public.admin_delete_menu_item(uuid, timestamptz, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
