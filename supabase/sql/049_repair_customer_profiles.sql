begin;

create or replace function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_profile() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.create_profile();

insert into public.profiles (id, full_name, email)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 120), email
from auth.users
on conflict (id) do nothing;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('-- Ensure the authenticated customer has a profile.' in definition) = 0 then
    if position('perform pg_advisory_xact_lock(hashtextextended(customer_uuid::text, 0));' in definition) = 0 then
      raise exception 'Unexpected checkout function; apply migrations through 048 first';
    end if;
    definition := replace(definition,
      'perform pg_advisory_xact_lock(hashtextextended(customer_uuid::text, 0));',
      'perform pg_advisory_xact_lock(hashtextextended(customer_uuid::text, 0));
  -- Ensure the authenticated customer has a profile.
  insert into public.profiles (id, full_name, email)
  select id, left(coalesce(raw_user_meta_data ->> ''full_name'', ''''), 120), email
  from auth.users where id = customer_uuid
  on conflict (id) do nothing;
  if not exists (select 1 from public.profiles where id = customer_uuid) then
    raise exception ''Your account is no longer available. Sign in again before checking out.'';
  end if;');
    execute definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
