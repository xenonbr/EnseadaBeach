-- 20261024000004_menu_storage: bucket de imagens do cardápio (leitura pública, escrita só admin/gerente).
-- Limites validados no servidor do Storage: 5 MB e apenas JPEG/PNG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy menu_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.has_role('admin','manager'));
create policy menu_images_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.has_role('admin','manager'))
  with check (bucket_id = 'menu-images' and public.has_role('admin','manager'));
create policy menu_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.has_role('admin','manager'));
-- Leitura: bucket público serve os arquivos pelo URL público; sem policy de listagem para anon.
