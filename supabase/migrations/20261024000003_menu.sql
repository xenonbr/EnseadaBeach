-- 20261024000003_menu: cardápio. Começa VAZIO (nenhum dado comercial inserido).
-- Reversão: supabase/rollback/0003_down.sql
create type public.publish_status as enum ('draft','published','archived');
create type public.production_sector as enum ('kitchen','bar');

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  status public.publish_status not null default 'draft',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index menu_categories_name_uq on public.menu_categories (lower(name)) where status <> 'archived';

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_cents integer not null check (price_cents >= 0),     -- dinheiro sempre em centavos inteiros
  status public.publish_status not null default 'draft',
  available boolean not null default true,
  sector public.production_sector not null default 'kitchen',
  image_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id, sort_order);
create index products_status_idx on public.products (status);

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  sort_order int not null default 0,
  check (max_select >= min_select)
);
create index option_groups_product_idx on public.option_groups (product_id);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.option_groups(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  available boolean not null default true,
  sort_order int not null default 0
);
create index options_group_idx on public.options (group_id);

create trigger menu_categories_touch before update on public.menu_categories for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- Auditoria de mudanças relevantes de produto (preço, status, disponibilidade).
create function public.audit_product_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform write_audit('product.create','product', new.id::text, jsonb_build_object('price_cents', new.price_cents));
  elsif (old.price_cents, old.status, old.available) is distinct from (new.price_cents, new.status, new.available) then
    perform write_audit('product.update','product', new.id::text, jsonb_build_object(
      'price_cents', jsonb_build_array(old.price_cents, new.price_cents),
      'status', jsonb_build_array(old.status, new.status),
      'available', jsonb_build_array(old.available, new.available)));
  end if;
  return new;
end $$;
create trigger products_audit after insert or update on public.products for each row execute function public.audit_product_change();

alter table public.menu_categories enable row level security;
alter table public.products enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;

-- Leitura pública apenas de itens publicados.
create policy cat_public_read on public.menu_categories for select to anon, authenticated using (status = 'published');
create policy prod_public_read on public.products for select to anon, authenticated using (
  status = 'published' and exists (select 1 from public.menu_categories c where c.id = category_id and c.status = 'published'));
create policy grp_public_read on public.option_groups for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy opt_public_read on public.options for select to anon, authenticated using (
  exists (select 1 from public.option_groups g join public.products p on p.id = g.product_id where g.id = group_id and p.status = 'published'));

-- Equipe lê tudo; admin/gerente escrevem. Sem DELETE em categorias/produtos: usa-se arquivamento.
create policy cat_staff_read on public.menu_categories for select to authenticated using (public.current_staff_role() is not null);
create policy prod_staff_read on public.products for select to authenticated using (public.current_staff_role() is not null);
create policy grp_staff_read on public.option_groups for select to authenticated using (public.current_staff_role() is not null);
create policy opt_staff_read on public.options for select to authenticated using (public.current_staff_role() is not null);

create policy cat_mgr_ins on public.menu_categories for insert to authenticated with check (public.has_role('admin','manager'));
create policy cat_mgr_upd on public.menu_categories for update to authenticated using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));
create policy prod_mgr_ins on public.products for insert to authenticated with check (public.has_role('admin','manager'));
create policy prod_mgr_upd on public.products for update to authenticated using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));
create policy grp_mgr_all on public.option_groups for all to authenticated using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));
create policy opt_mgr_all on public.options for all to authenticated using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));

grant select on public.menu_categories, public.products, public.option_groups, public.options to anon, authenticated;
grant insert, update on public.menu_categories, public.products to authenticated;
grant insert, update, delete on public.option_groups, public.options to authenticated;
