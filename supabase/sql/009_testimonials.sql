begin;

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(author_name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 3000),
  rating smallint check (rating between 1 and 5),
  source_name text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  review_date date,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger testimonials_updated_at before update on public.testimonials
for each row execute function private.set_updated_at();

alter table public.testimonials enable row level security;
revoke all on public.testimonials from anon, authenticated;
grant select on public.testimonials to anon, authenticated;
grant insert, update, delete on public.testimonials to authenticated;
grant all on public.testimonials to service_role;

create policy testimonials_read on public.testimonials for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy testimonials_admin_write on public.testimonials for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;