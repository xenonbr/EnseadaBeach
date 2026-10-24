-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop function if exists public.start_production_task(uuid),
  public.complete_production_task(uuid),
  public.set_product_availability_sector(uuid,boolean),
  public.mark_order_delivered(uuid,int),
  public.create_service_call(text,text,public.service_call_reason,text),
  public.update_service_call_status(uuid,public.service_call_status,text);

drop table if exists public.service_calls cascade;
drop type if exists public.service_call_reason, public.service_call_status;
