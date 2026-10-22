begin;

lock table public.orders, public.order_items in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.orders
    where status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup')
  ) then
    raise exception 'Inventory migration requires an ordering maintenance window: reconcile or complete all active orders, then retry 050_inventory.sql';
  end if;
end;
$$;

create table public.inventory_items (
  menu_item_id uuid primary key references public.menu_items(id) on delete restrict,
  tracking_mode text not null default 'none' check (tracking_mode in ('none', 'global', 'event')),
  unit_label text not null default 'each' check (char_length(unit_label) between 1 and 30),
  on_hand integer not null default 0 check (on_hand between 0 and 1000000),
  version bigint not null default 0 check (version >= 0)
);

create table public.inventory_allocations (
  menu_item_id uuid not null references public.inventory_items(menu_item_id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  remaining integer not null check (remaining between 0 and 1000000),
  version bigint not null default 0 check (version >= 0),
  primary key (menu_item_id, event_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  menu_item_id uuid not null references public.inventory_items(menu_item_id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  action text not null,
  quantity integer not null,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null
);
create index inventory_movements_item_created_idx on public.inventory_movements (menu_item_id, created_at desc);
create index inventory_movements_event_created_idx on public.inventory_movements (event_id, created_at desc);

create table public.inventory_order_stock (
  order_id uuid not null references public.orders(id) on delete restrict,
  menu_item_id uuid not null references public.inventory_items(menu_item_id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 1000000),
  state text not null check (state in ('held', 'sold', 'released', 'restocked')),
  expires_at timestamptz,
  primary key (order_id, menu_item_id)
);
create index inventory_order_stock_active_idx
  on public.inventory_order_stock (menu_item_id, event_id, expires_at)
  where state = 'held';

create table private.inventory_action_requests (
  request_uuid uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  item_uuid uuid not null,
  event_uuid uuid,
  action text not null,
  quantity integer not null,
  expected_version bigint,
  reason text,
  tracking_mode text,
  unit_label text,
  created_at timestamptz not null default now()
);
revoke all on private.inventory_action_requests from public, anon, authenticated, service_role;

create table private.inventory_order_transactions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  transaction_id xid8 not null
);
revoke all on private.inventory_order_transactions from public, anon, authenticated, service_role;

insert into public.inventory_items(menu_item_id)
select id from public.menu_items
on conflict (menu_item_id) do nothing;

create function private.seed_inventory_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_items(menu_item_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.seed_inventory_item() from public, anon, authenticated, service_role;
create trigger menu_items_seed_inventory after insert on public.menu_items
for each row execute function private.seed_inventory_item();

alter table public.inventory_items enable row level security;
alter table public.inventory_allocations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_order_stock enable row level security;

revoke all on public.inventory_items, public.inventory_allocations, public.inventory_movements, public.inventory_order_stock from anon, authenticated, service_role;
grant select on public.inventory_items, public.inventory_allocations, public.inventory_movements, public.inventory_order_stock to authenticated;
grant select on public.inventory_items, public.inventory_allocations, public.inventory_movements, public.inventory_order_stock to service_role;

create policy inventory_items_admin_read on public.inventory_items for select to authenticated
using ((select private.is_admin()));
create policy inventory_allocations_admin_read on public.inventory_allocations for select to authenticated
using ((select private.is_admin()));
create policy inventory_movements_admin_read on public.inventory_movements for select to authenticated
using ((select private.is_admin()));
create policy inventory_order_stock_admin_read on public.inventory_order_stock for select to authenticated
using ((select private.is_admin()));

create function private.inventory_lock()
returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(731050, 1);
$$;
revoke all on function private.inventory_lock() from public, anon, authenticated, service_role;

create function private.inventory_lock_statement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.inventory_lock();
  return null;
end;
$$;
revoke all on function private.inventory_lock_statement() from public, anon, authenticated, service_role;

create function private.inventory_record_order_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.inventory_order_transactions(order_id, transaction_id) values(new.id, pg_current_xact_id());
  return new;
end;
$$;
revoke all on function private.inventory_record_order_transaction() from public, anon, authenticated, service_role;
create trigger orders_inventory_transaction after insert on public.orders
for each row execute function private.inventory_record_order_transaction();

create function private.inventory_protect_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.inventory_order_stock where order_id = old.id) and (
    (new.id, new.event_id, new.payment_method, new.checkout_key, new.subtotal_pence)
      is distinct from (old.id, old.event_id, old.payment_method, old.checkout_key, old.subtotal_pence)
    or (old.status = 'cancelled' and new.status <> 'cancelled')
    or (new.reservation_expires_at > old.reservation_expires_at
      and exists (select 1 from public.inventory_order_stock where order_id = old.id and state = 'held'))
  ) then raise exception 'Order inventory snapshots are immutable'; end if;
  return new;
end;
$$;
revoke all on function private.inventory_protect_order() from public, anon, authenticated, service_role;
create trigger orders_inventory_immutable before update on public.orders
for each row execute function private.inventory_protect_order();

create function public.admin_inventory_action(
  item_uuid uuid,
  event_uuid uuid,
  action text,
  quantity integer,
  expected_version bigint,
  reason text,
  tracking_mode text default null,
  unit_label text default null,
  request_uuid uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item public.inventory_items%rowtype;
  allocation public.inventory_allocations%rowtype;
  old_remaining integer;
  delta integer;
  allocated integer;
  held_event integer;
  held_global integer;
  reason_text text := nullif(trim(reason), '');
  allocation_exists boolean;
  prior_request private.inventory_action_requests%rowtype;
  request_id uuid := request_uuid;
  requested_tracking_mode text := tracking_mode;
  requested_unit_label text := unit_label;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if quantity is null or quantity < 0 or quantity > 1000000 then raise exception 'Quantity is out of range'; end if;
  if reason_text is not null and char_length(reason_text) > 500 then raise exception 'Reason must be at most 500 characters'; end if;
  if action is null or action not in ('configure', 'receive', 'correct', 'allocate', 'return', 'waste', 'sale') then
    raise exception 'Unsupported inventory action';
  end if;
  if action in ('waste', 'sale', 'correct') and reason_text is null then
    raise exception 'A reason is required';
  end if;
  if action = 'configure' and tracking_mode is distinct from null
     and tracking_mode not in ('none', 'global', 'event') then
    raise exception 'Invalid tracking mode';
  end if;
  if action = 'configure' and unit_label is not null and char_length(trim(unit_label)) not between 1 and 30 then
    raise exception 'Unit label must contain 1 to 30 characters';
  end if;
  perform private.inventory_lock();
  if request_id is not null then
    select * into prior_request from private.inventory_action_requests requests where requests.request_uuid = request_id;
    if found then
      if prior_request.actor_id is distinct from auth.uid() or prior_request.item_uuid is distinct from item_uuid
        or prior_request.event_uuid is distinct from event_uuid
        or prior_request.action is distinct from action or prior_request.quantity is distinct from quantity
        or prior_request.expected_version is distinct from expected_version
        or prior_request.reason is distinct from reason
        or prior_request.tracking_mode is distinct from tracking_mode
        or prior_request.unit_label is distinct from unit_label then
        raise exception 'Request UUID was already used with a different inventory action';
      end if;
      return;
    end if;
  end if;
  select * into item from public.inventory_items where menu_item_id = item_uuid for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if event_uuid is not null and not exists (select 1 from public.events where id = event_uuid) then
    raise exception 'Event not found';
  end if;

  if action = 'configure' then
    if expected_version is null or item.version <> expected_version then raise exception 'Inventory item changed'; end if;
    if tracking_mode is null and unit_label is null then raise exception 'Provide tracking_mode or unit_label'; end if;
    if tracking_mode is not null and tracking_mode is distinct from item.tracking_mode and reason_text is null then
      raise exception 'A reason is required when changing tracking mode';
    end if;
    if exists (select 1 from public.inventory_order_stock where menu_item_id = item_uuid and state = 'held'
      and (expires_at is null or expires_at > now())) then
      raise exception 'Inventory configuration cannot change while active commitments exist';
    end if;
    if tracking_mode is not null and tracking_mode is distinct from item.tracking_mode
      and exists (select 1 from public.inventory_allocations where menu_item_id = item_uuid) then
      raise exception 'Tracking mode cannot change while allocations exist';
    end if;
    if tracking_mode is not null and tracking_mode is distinct from item.tracking_mode and exists (
      select 1 from public.order_items line join public.orders orders on orders.id = line.order_id
      where line.menu_item_id = item_uuid
        and orders.status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup')
    ) then raise exception 'Tracking mode cannot change while outstanding orders exist'; end if;
    update public.inventory_items set tracking_mode = coalesce(requested_tracking_mode, item.tracking_mode),
      unit_label = coalesce(nullif(trim(requested_unit_label), ''), item.unit_label), version = version + 1
      where menu_item_id = item_uuid;
    insert into public.inventory_movements(menu_item_id, event_id, action, quantity, reason, actor_id)
      values(item_uuid, event_uuid, 'configure', 0, reason_text, auth.uid());
    if request_id is not null then
      insert into private.inventory_action_requests(request_uuid, actor_id, item_uuid, event_uuid, action,
        quantity, expected_version, reason, tracking_mode, unit_label)
      values(request_id, auth.uid(), item_uuid, event_uuid, action, quantity, expected_version,
        reason, tracking_mode, unit_label);
    end if;
    return;
  elsif action in ('receive', 'correct') then
    if item.tracking_mode <> 'global' then raise exception 'This action requires global tracking'; end if;
    if expected_version is null or item.version <> expected_version then raise exception 'Inventory item changed'; end if;
    if action = 'receive' then
      if quantity = 0 then raise exception 'Receipt quantity must be positive'; end if;
      delta := quantity;
      update public.inventory_items set on_hand = on_hand + quantity, version = version + 1
        where menu_item_id = item_uuid;
    else
      delta := quantity - item.on_hand;
      select coalesce(sum(remaining), 0)::integer into allocated from public.inventory_allocations where menu_item_id = item_uuid;
      if quantity < allocated then raise exception 'Correction would leave allocations greater than stock on hand'; end if;
      select coalesce(sum(s.quantity), 0)::integer into held_global
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if quantity < held_global then raise exception 'Correction would leave active stock holds uncovered'; end if;
      update public.inventory_items set on_hand = quantity, version = version + 1 where menu_item_id = item_uuid;
    end if;
    insert into public.inventory_movements(menu_item_id, action, quantity, reason, actor_id)
    values(item_uuid, action, delta, reason_text, auth.uid());
    if request_id is not null then
      insert into private.inventory_action_requests(request_uuid, actor_id, item_uuid, event_uuid, action,
        quantity, expected_version, reason, tracking_mode, unit_label)
      values(request_id, auth.uid(), item_uuid, event_uuid, action, quantity, expected_version,
        reason, tracking_mode, unit_label);
    end if;
    return;
  elsif action = 'allocate' then
    if event_uuid is null then raise exception 'An event is required'; end if;
    if item.tracking_mode not in ('global', 'event') then raise exception 'Configure stock tracking before allocating'; end if;
    if exists (select 1 from public.inventory_order_stock where menu_item_id = item_uuid and event_id = event_uuid
      and state = 'held' and (expires_at is null or expires_at > now())) then
      raise exception 'Active checkout holds prevent allocation changes';
    end if;
    select * into allocation from public.inventory_allocations
      where menu_item_id = item_uuid and event_id = event_uuid for update;
    allocation_exists := found;
    if allocation_exists then
      if expected_version is null or allocation.version <> expected_version then raise exception 'Event allocation changed'; end if;
      old_remaining := allocation.remaining;
    else
      if expected_version is not null then raise exception 'Event allocation changed'; end if;
      old_remaining := 0;
    end if;
    select coalesce(sum(remaining), 0)::integer into allocated from public.inventory_allocations where menu_item_id = item_uuid;
    if item.tracking_mode = 'global' and allocated - old_remaining + quantity > item.on_hand then
      raise exception 'Allocations cannot exceed stock on hand';
    end if;
    if allocation_exists then
      update public.inventory_allocations set remaining = quantity, version = version + 1
        where menu_item_id = item_uuid and event_id = event_uuid;
    else
      insert into public.inventory_allocations(menu_item_id, event_id, remaining) values(item_uuid, event_uuid, quantity);
    end if;
    insert into public.inventory_movements(menu_item_id, event_id, action, quantity, reason, actor_id)
    values(item_uuid, event_uuid, action, quantity - old_remaining, reason_text, auth.uid());
    if request_id is not null then
      insert into private.inventory_action_requests(request_uuid, actor_id, item_uuid, event_uuid, action,
        quantity, expected_version, reason, tracking_mode, unit_label)
      values(request_id, auth.uid(), item_uuid, event_uuid, action, quantity, expected_version,
        reason, tracking_mode, unit_label);
    end if;
    return;
  elsif action = 'return' then
    if event_uuid is null or quantity = 0 then raise exception 'An event and positive return quantity are required'; end if;
    if exists (select 1 from public.inventory_order_stock where menu_item_id = item_uuid and event_id = event_uuid
      and state = 'held' and (expires_at is null or expires_at > now())) then
      raise exception 'Active checkout holds prevent allocation changes';
    end if;
    select * into allocation from public.inventory_allocations
      where menu_item_id = item_uuid and event_id = event_uuid for update;
    if not found or expected_version is null or allocation.version <> expected_version then raise exception 'Event allocation changed'; end if;
    if quantity > allocation.remaining then raise exception 'Return exceeds remaining allocation'; end if;
    update public.inventory_allocations set remaining = remaining - quantity, version = version + 1
      where menu_item_id = item_uuid and event_id = event_uuid;
    insert into public.inventory_movements(menu_item_id, event_id, action, quantity, reason, actor_id)
    values(item_uuid, event_uuid, action, -quantity, reason_text, auth.uid());
    if request_id is not null then
      insert into private.inventory_action_requests(request_uuid, actor_id, item_uuid, event_uuid, action,
        quantity, expected_version, reason, tracking_mode, unit_label)
      values(request_id, auth.uid(), item_uuid, event_uuid, action, quantity, expected_version,
        reason, tracking_mode, unit_label);
    end if;
    return;
  elsif action in ('waste', 'sale') then
    if quantity = 0 then raise exception 'Quantity must be positive'; end if;
    if item.tracking_mode = 'none' then raise exception 'Item is not stock tracked'; end if;
    if action = 'sale' and event_uuid is null then raise exception 'Walk-up sale requires an event'; end if;
    if event_uuid is not null then
      select * into allocation from public.inventory_allocations
        where menu_item_id = item_uuid and event_id = event_uuid for update;
      if not found or expected_version is null or allocation.version <> expected_version then raise exception 'Event allocation changed'; end if;
      select coalesce(sum(s.quantity), 0)::integer into held_event
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.event_id = event_uuid and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if quantity > allocation.remaining - held_event then raise exception 'Quantity exceeds uncommitted event allocation'; end if;
      update public.inventory_allocations set remaining = remaining - quantity, version = version + 1
        where menu_item_id = item_uuid and event_id = event_uuid;
    elsif item.tracking_mode = 'event' then
      raise exception 'Event stock operations require an event';
    end if;
    if item.tracking_mode = 'global' and quantity > item.on_hand then raise exception 'Quantity exceeds stock on hand'; end if;
    select coalesce(sum(s.quantity), 0)::integer into held_global
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = item_uuid and s.state = 'held'
        and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
    if item.tracking_mode = 'global' and quantity > item.on_hand - held_global then
      raise exception 'Quantity exceeds uncommitted stock on hand';
    end if;
    if event_uuid is null then
      if expected_version is null or item.version <> expected_version then raise exception 'Inventory item changed'; end if;
      select coalesce(sum(remaining), 0)::integer into allocated from public.inventory_allocations where menu_item_id = item_uuid;
      if item.on_hand - quantity < allocated then raise exception 'Waste would leave allocations greater than stock on hand'; end if;
    end if;
    update public.inventory_items set on_hand = on_hand - quantity, version = version + 1
      where menu_item_id = item_uuid and item.tracking_mode = 'global';
    insert into public.inventory_movements(menu_item_id, event_id, action, quantity, reason, actor_id)
    values(item_uuid, event_uuid, action, -quantity, reason_text, auth.uid());
    if request_id is not null then
      insert into private.inventory_action_requests(request_uuid, actor_id, item_uuid, event_uuid, action,
        quantity, expected_version, reason, tracking_mode, unit_label)
      values(request_id, auth.uid(), item_uuid, event_uuid, action, quantity, expected_version,
        reason, tracking_mode, unit_label);
    end if;
    return;
  end if;
end;
$$;
revoke all on function public.admin_inventory_action(uuid, uuid, text, integer, bigint, text, text, text, uuid) from public, anon, service_role;
grant execute on function public.admin_inventory_action(uuid, uuid, text, integer, bigint, text, text, text, uuid) to authenticated;

create function private.inventory_capture_order_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  order_record public.orders%rowtype;
  item public.inventory_items%rowtype;
  allocation public.inventory_allocations%rowtype;
  previous_qty integer := 0;
  target_qty integer;
  held_elsewhere integer;
  global_held integer;
  held_current_event integer;
  is_cash_sale boolean;
begin
  if new.menu_item_id is null then return new; end if;
  perform private.inventory_lock();
  select * into order_record from public.orders where id = new.order_id;
  if not found then raise exception 'Stock availability is unavailable. Please try again shortly.'; end if;
  select * into item from public.inventory_items where menu_item_id = new.menu_item_id for update;
  if not found then raise exception 'Stock availability is unavailable. Please try again shortly.'; end if;
  if item.tracking_mode = 'none'
    and not exists (select 1 from public.inventory_order_stock where order_id = new.order_id) then return new; end if;
  if order_record.status not in ('pending_payment', 'ordered')
    or order_record.payment_status <> 'unpaid'
    or not exists (
      select 1 from private.inventory_order_transactions
      where order_id = new.order_id and transaction_id = pg_current_xact_id()
    ) then
    raise exception 'Order item inventory snapshots are immutable';
  end if;
  if item.tracking_mode = 'none' then return new; end if;
  is_cash_sale := order_record.payment_method = 'cash' and order_record.status <> 'cancelled';
  select * into allocation from public.inventory_allocations
    where menu_item_id = new.menu_item_id and event_id = order_record.event_id for update;
  if not found then raise exception 'Stock changed. Review your bag before paying.'; end if;
  select quantity into previous_qty from public.inventory_order_stock
    where order_id = new.order_id and menu_item_id = new.menu_item_id for update;
  previous_qty := coalesce(previous_qty, 0);
  target_qty := previous_qty + new.quantity;

  if is_cash_sale then
    select coalesce(sum(s.quantity), 0)::integer into held_current_event
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = new.menu_item_id and s.event_id = order_record.event_id
        and s.state = 'held' and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    select coalesce(sum(s.quantity), 0)::integer into global_held
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = new.menu_item_id and s.state = 'held'
        and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
    if allocation.remaining - held_current_event < new.quantity
      or (item.tracking_mode = 'global' and item.on_hand - global_held < new.quantity) then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    update public.inventory_allocations set remaining = remaining - new.quantity, version = version + 1
      where menu_item_id = new.menu_item_id and event_id = order_record.event_id;
    update public.inventory_items set on_hand = on_hand - new.quantity, version = version + 1
      where menu_item_id = new.menu_item_id and tracking_mode = 'global';
    insert into public.inventory_order_stock(order_id, menu_item_id, event_id, quantity, state)
      values(new.order_id, new.menu_item_id, order_record.event_id, target_qty, 'sold')
      on conflict (order_id, menu_item_id) do update set quantity = excluded.quantity;
    insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
      values(new.menu_item_id, order_record.event_id, new.order_id, 'sale', -new.quantity, 'Cash order accepted');
  else
    select coalesce(sum(s.quantity), 0)::integer into held_elsewhere
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = new.menu_item_id and s.event_id = order_record.event_id
        and s.state = 'held' and s.order_id <> new.order_id
        and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    select coalesce(sum(s.quantity), 0)::integer into global_held
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = new.menu_item_id and s.state = 'held'
        and s.order_id <> new.order_id and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    if allocation.remaining - held_elsewhere < target_qty
      or (item.tracking_mode = 'global' and item.on_hand - global_held < target_qty) then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    insert into public.inventory_order_stock(order_id, menu_item_id, event_id, quantity, state, expires_at)
      values(new.order_id, new.menu_item_id, order_record.event_id, target_qty, 'held', order_record.reservation_expires_at)
      on conflict (order_id, menu_item_id) do update
        set quantity = excluded.quantity, expires_at = excluded.expires_at
        where public.inventory_order_stock.state = 'held';
    -- A real row write also forces stale repeatable-read transactions to retry instead of oversubscribing holds.
    update public.inventory_items set version = version + 1 where menu_item_id = new.menu_item_id;
    if previous_qty = 0 then
      insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
        values(new.menu_item_id, order_record.event_id, new.order_id, 'hold', 0, 'Checkout stock hold');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_capture_order_item() from public, anon, authenticated, service_role;
create trigger order_items_inventory_hold after insert on public.order_items
for each row execute function private.inventory_capture_order_item();

create function private.inventory_sync_hold_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reservation_expires_at is distinct from old.reservation_expires_at then
    perform private.inventory_lock();
    update public.inventory_order_stock set expires_at = new.reservation_expires_at
      where order_id = new.id and state = 'held';
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_sync_hold_expiry() from public, anon, authenticated, service_role;
create trigger orders_inventory_expiry after update of reservation_expires_at on public.orders
for each row execute function private.inventory_sync_hold_expiry();

create function private.inventory_protect_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_uuid uuid;
begin
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
revoke all on function private.inventory_protect_order_items() from public, anon, authenticated, service_role;
create trigger order_items_inventory_immutable before update or delete on public.order_items
for each row execute function private.inventory_protect_order_items();

create function private.inventory_release_order(order_uuid uuid, release_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare stock record;
begin
  perform private.inventory_lock();
  for stock in select * from public.inventory_order_stock
    where order_id = order_uuid and state = 'held' for update
  loop
    update public.inventory_order_stock set state = 'released' where order_id = order_uuid and menu_item_id = stock.menu_item_id;
    insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
      values(stock.menu_item_id, stock.event_id, order_uuid, 'release', 0, release_reason);
  end loop;
end;
$$;
revoke all on function private.inventory_release_order(uuid, text) from public, anon, authenticated, service_role;

create function private.inventory_finalize_order(order_uuid uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare stock record; item public.inventory_items%rowtype; allocation public.inventory_allocations%rowtype;
  held_elsewhere integer; global_held integer;
begin
  perform private.inventory_lock();
  for stock in select * from public.inventory_order_stock where order_id = order_uuid and state = 'held'
    order by menu_item_id for update
  loop
    select * into item from public.inventory_items where menu_item_id = stock.menu_item_id for update;
    select * into allocation from public.inventory_allocations
      where menu_item_id = stock.menu_item_id and event_id = stock.event_id for update;
    if not found then return false; end if;
    select coalesce(sum(s.quantity), 0)::integer into held_elsewhere
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = stock.menu_item_id and s.event_id = stock.event_id
        and s.state = 'held' and s.order_id <> order_uuid
        and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
    select coalesce(sum(s.quantity), 0)::integer into global_held
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = stock.menu_item_id and s.state = 'held'
        and s.order_id <> order_uuid and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    if (item.tracking_mode = 'global' and item.on_hand - global_held < stock.quantity)
      or allocation.remaining - held_elsewhere < stock.quantity then
      return false;
    end if;
  end loop;
  for stock in select * from public.inventory_order_stock where order_id = order_uuid and state = 'held'
    order by menu_item_id for update
  loop
    update public.inventory_items set on_hand = on_hand - stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and tracking_mode = 'global';
    update public.inventory_allocations set remaining = remaining - stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and event_id = stock.event_id;
    update public.inventory_order_stock set state = 'sold' where order_id = order_uuid and menu_item_id = stock.menu_item_id;
    insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
      values(stock.menu_item_id, stock.event_id, order_uuid, 'sale', -stock.quantity, 'Paid order');
  end loop;
  return true;
end;
$$;
revoke all on function private.inventory_finalize_order(uuid) from public, anon, authenticated, service_role;

create function private.inventory_order_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.inventory_release_order(new.id, coalesce(new.cancellation_reason, 'Order cancelled'));
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_order_changed() from public, anon, authenticated, service_role;
create trigger orders_inventory_release after update on public.orders
for each row execute function private.inventory_order_changed();

create function private.inventory_order_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'cancelled' and not private.inventory_finalize_order(new.id) then
    new.status := 'cancelled';
    new.cancellation_reason := 'Payment received after stock was no longer available; refund required.';
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_order_paid() from public, anon, authenticated, service_role;
create trigger orders_inventory_paid before update of payment_status on public.orders
for each row when (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
execute function private.inventory_order_paid();

create function public.admin_restock_order(order_uuid uuid, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare stock record; order_record public.orders%rowtype; reason_text text := nullif(trim(reason), '');
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if reason_text is null then raise exception 'A reason is required'; end if;
  if char_length(reason_text) > 500 then raise exception 'Reason must be at most 500 characters'; end if;
  perform private.inventory_lock();
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then raise exception 'Order not found'; end if;
  if order_record.status <> 'cancelled' or order_record.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    raise exception 'Only cancelled paid orders can be restocked';
  end if;
  for stock in select * from public.inventory_order_stock
    where order_id = order_uuid and state = 'sold' order by menu_item_id for update
  loop
    update public.inventory_items set on_hand = on_hand + stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and tracking_mode = 'global';
    update public.inventory_allocations set remaining = remaining + stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and event_id = stock.event_id;
    if not found then raise exception 'Cannot restore stock: event allocation no longer exists'; end if;
    update public.inventory_order_stock set state = 'restocked'
      where order_id = order_uuid and menu_item_id = stock.menu_item_id;
    insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason, actor_id)
      values(stock.menu_item_id, stock.event_id, order_uuid, 'restore_order', stock.quantity, reason_text, auth.uid());
  end loop;
end;
$$;
revoke all on function public.admin_restock_order(uuid, text) from public, anon, service_role;
grant execute on function public.admin_restock_order(uuid, text) to authenticated;

create function public.admin_inventory_sales()
returns table(menu_item_id uuid, event_id uuid, sold_quantity bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query
    select movement.menu_item_id, movement.event_id, -sum(movement.quantity)::bigint
    from public.inventory_movements movement
    where movement.action in ('sale', 'restore_order') and movement.event_id is not null
    group by movement.menu_item_id, movement.event_id;
end;
$$;
revoke all on function public.admin_inventory_sales() from public, anon, service_role;
grant execute on function public.admin_inventory_sales() to authenticated;

create function public.admin_return_event_stock(event_uuid uuid, expected_allocations jsonb, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare allocation public.inventory_allocations%rowtype; reason_text text := nullif(trim(reason), '');
  event_record public.events%rowtype; expected_count integer; actual_count integer;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if reason_text is null then raise exception 'A reason is required'; end if;
  if char_length(reason_text) > 500 then raise exception 'Reason must be at most 500 characters'; end if;
  if expected_allocations is null or jsonb_typeof(expected_allocations) <> 'array' then
    raise exception 'Expected allocations must be an array';
  end if;
  perform private.inventory_lock();
  select * into event_record from public.events where id = event_uuid for update;
  if not found then raise exception 'Event not found'; end if;
  if event_record.ordering_status <> 'closed'
    and coalesce(event_record.orders_close_at, event_record.ends_at) > now() then
    raise exception 'Close ordering or wait until the event has ended before returning stock';
  end if;
  if exists (
    select 1 from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.event_id = event_uuid and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) then raise exception 'Cannot return event stock while active checkout holds exist'; end if;

  select count(*)::integer into expected_count from jsonb_array_elements(expected_allocations);
  select count(*)::integer into actual_count from public.inventory_allocations
    where event_id = event_uuid and remaining > 0;
  if expected_count <> actual_count or exists (
    select 1 from public.inventory_allocations a
    where a.event_id = event_uuid and a.remaining > 0
      and not exists (
        select 1 from jsonb_to_recordset(expected_allocations) as x(menu_item_id uuid, version bigint, remaining integer)
        where x.menu_item_id = a.menu_item_id and x.version = a.version and x.remaining = a.remaining
      )
  ) or exists (
    select 1 from jsonb_to_recordset(expected_allocations) as x(menu_item_id uuid, version bigint, remaining integer)
    where not exists (
      select 1 from public.inventory_allocations a
      where a.event_id = event_uuid and a.menu_item_id = x.menu_item_id
        and a.version = x.version and a.remaining = x.remaining and a.remaining > 0
    )
  ) then raise exception 'Event allocations changed; refresh the stock overview and retry';
  end if;

  for allocation in select * from public.inventory_allocations
    where event_id = event_uuid and remaining > 0 order by menu_item_id for update
  loop
    update public.inventory_allocations set remaining = 0, version = version + 1
      where menu_item_id = allocation.menu_item_id and event_id = event_uuid;
    insert into public.inventory_movements(menu_item_id, event_id, action, quantity, reason, actor_id)
      values(allocation.menu_item_id, event_uuid, 'return_event', -allocation.remaining, reason_text, auth.uid());
  end loop;
end;
$$;
revoke all on function public.admin_return_event_stock(uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.admin_return_event_stock(uuid, jsonb, text) to authenticated;

create function public.get_event_stock(event_uuid uuid default null, supplied_key text default null)
returns table(menu_item_id uuid, tracking_mode text, available_quantity integer)
language plpgsql stable security definer set search_path = '' as $$
declare event_record public.events%rowtype;
begin
  if event_uuid is not null then
    select * into event_record from public.events where id = event_uuid;
    if not found or not event_record.is_published then raise exception 'Event unavailable' using errcode = '42501'; end if;
    if event_record.is_private and not public.check_event_ordering_access(event_uuid, supplied_key) then
      raise exception 'Event access required' using errcode = '42501';
    end if;
  end if;
  return query
  select i.menu_item_id, i.tracking_mode,
    case
      when i.tracking_mode = 'none' then null::integer
      when event_uuid is null and i.tracking_mode = 'global' then
        case when i.on_hand = 0 then 0 else null::integer end
      when event_uuid is null then null::integer
      else case when i.tracking_mode = 'global' then
        greatest(0, least(coalesce(a.remaining - coalesce(eh.qty, 0), 0),
          i.on_hand - coalesce(gh.qty, 0)))
        else greatest(0, coalesce(a.remaining - coalesce(eh.qty, 0), 0)) end
    end
  from public.inventory_items i
  left join public.inventory_allocations a on a.menu_item_id = i.menu_item_id and a.event_id = event_uuid
  left join lateral (
    select sum(s.quantity)::integer qty from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.menu_item_id = i.menu_item_id and s.event_id = event_uuid and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) eh on true
  left join lateral (
    select sum(s.quantity)::integer qty from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.menu_item_id = i.menu_item_id and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) gh on true
  order by i.menu_item_id;
end;
$$;
revoke all on function public.get_event_stock(uuid, text) from public;
grant execute on function public.get_event_stock(uuid, text) to anon, authenticated, service_role;

create or replace function public.process_stripe_checkout(event_id text, event_kind text, order_uuid uuid,
  session_id text, intent_id text, amount integer, payment_currency text, occurred_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare order_record public.orders%rowtype; payment_record public.payments%rowtype;
  payment_time timestamptz := coalesce(occurred_at, now());
begin
  perform private.inventory_lock();
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then raise exception 'Order not found'; end if;
  select * into payment_record from public.payments where order_id = order_uuid and provider = 'stripe' for update;
  if not found or (payment_record.stripe_checkout_session_id is not null
    and payment_record.stripe_checkout_session_id <> session_id)
    or payment_record.amount_pence <> amount or order_record.total_pence <> amount
    or payment_currency <> order_record.currency then raise exception 'Payment does not match order'; end if;
  if event_kind not in ('checkout.session.completed', 'checkout.session.expired') then
    raise exception 'Unsupported payment event';
  end if;
  insert into public.stripe_webhook_events(stripe_event_id, event_type)
    values(event_id, event_kind) on conflict do nothing;
  if not found then return order_record.status = 'cancelled' and order_record.payment_status in ('paid', 'partially_refunded'); end if;
  if event_kind = 'checkout.session.completed' then
    if intent_id is null then raise exception 'Missing payment intent'; end if;
    if payment_record.status in ('pending', 'failed') then
      if order_record.status = 'pending_payment' and payment_time >= order_record.reservation_expires_at then
        update public.orders set status = 'cancelled',
          cancellation_reason = 'Payment completed after the pickup payment deadline. A refund has been requested.'
          where id = order_uuid;
      end if;
      update public.payments set status = 'succeeded', paid_at = payment_time,
        stripe_checkout_session_id = session_id, stripe_payment_intent_id = intent_id
        where id = payment_record.id;
      update public.orders set payment_status = 'paid',
        status = case when status = 'pending_payment' then 'ordered' else status end where id = order_uuid;
      select * into order_record from public.orders where id = order_uuid;
    end if;
    return order_record.status = 'cancelled'
      and order_record.payment_status not in ('refunded', 'partially_refunded');
  else
    if order_record.status = 'pending_payment' and payment_record.status = 'pending' then
      update public.orders set status = 'cancelled', payment_status = 'failed',
        cancellation_reason = 'Payment session expired.' where id = order_uuid;
      update public.payments set status = 'failed', stripe_checkout_session_id = session_id
        where id = payment_record.id;
    end if;
    return false;
  end if;
end;
$$;
revoke all on function public.process_stripe_checkout(text, text, uuid, text, text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.process_stripe_checkout(text, text, uuid, text, text, integer, text, timestamptz) to service_role;

-- Catalogue table locks precede the inventory lock; order/event/slot/payment row locks follow it.
-- Preserve the checkout upgrades from 048/049 instead of copying their implementations.
do $$
declare signature text; definition text; table_name text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('in share mode;' in definition) = 0 then
    raise exception 'Unexpected checkout implementation; apply checkout migrations through 049 before 050';
  end if;
  definition := replace(definition, 'in share mode;',
    'in share mode; perform private.inventory_lock();');
  execute definition;
  foreach signature in array array[
    'public.attach_stripe_checkout(uuid,text,timestamptz)',
    'public.cancel_card_checkout(uuid,uuid)',
    'public.admin_set_order_status(uuid,text,text)',
    'public.admin_mark_cash_paid(uuid)',
    'public.process_stripe_refund(text,text,integer)',
    'public.admin_lock_pickup_slot(uuid,timestamptz,boolean)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    execute regexp_replace(definition, '\mbegin\M', E'begin\n  perform private.inventory_lock();', 'i');
  end loop;
  foreach table_name in array array['orders', 'order_items', 'events', 'pickup_slots', 'pickup_schedules', 'payments'] loop
    execute format('create trigger inventory_serialize before insert or update or delete on public.%I
      for each statement execute function private.inventory_lock_statement()', table_name);
  end loop;
end;
$$;

do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach table_name in array array['inventory_items', 'inventory_allocations', 'inventory_movements', 'inventory_order_stock'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
