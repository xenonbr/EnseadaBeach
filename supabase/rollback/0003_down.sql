-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop table if exists public.options, public.option_groups, public.products, public.menu_categories cascade;
drop function if exists public.audit_product_change();
drop type if exists public.production_sector, public.publish_status;
