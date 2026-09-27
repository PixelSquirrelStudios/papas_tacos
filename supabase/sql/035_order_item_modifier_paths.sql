begin;

alter table public.order_item_modifiers add column if not exists selection_key text;
update public.order_item_modifiers set selection_key = coalesce(modifier_option_id, id)::text where selection_key is null;
alter table public.order_item_modifiers alter column selection_key set not null;
alter table public.order_item_modifiers alter column selection_key set default gen_random_uuid()::text;
alter table public.order_item_modifiers drop constraint if exists order_item_modifiers_order_item_id_modifier_option_id_key;
create unique index if not exists order_item_modifiers_selection_idx on public.order_item_modifiers(order_item_id, selection_key);

notify pgrst, 'reload schema';
commit;