-- A7: serialize with financial cancellation (shop -> order -> delivery).
-- Only the server order-transition boundary calls this persistence primitive.
create function public.transition_manual_delivery(p_order_id uuid, p_update jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.orders%rowtype;
  d public.deliveries%rowtype;
  sid uuid;
  next_status text := p_update->>'status';
  target public.order_status;
  stamp timestamptz;
  changed_order boolean := false;
begin
  if p_update is null or jsonb_typeof(p_update)<>'object' or
     next_status is null or next_status not in ('booked','in_transit','delivered','failed') or
     exists(select 1 from jsonb_object_keys(p_update) k where k not in ('status','feeSatang','trackingUrl','note')) then
    raise sqlstate 'PT422' using message='INVALID_DELIVERY_INPUT';
  end if;
  if p_update ? 'feeSatang' and (jsonb_typeof(p_update->'feeSatang')<>'number' or
    (p_update->>'feeSatang') !~ '^[0-9]+$' or
    (p_update->>'feeSatang')::numeric > 2147483647) then
    raise sqlstate 'PT422' using message='INVALID_DELIVERY_FEE';
  end if;
  if p_update ? 'note' and (jsonb_typeof(p_update->'note')<>'string' or char_length(p_update->>'note')>500) then
    raise sqlstate 'PT422' using message='INVALID_DELIVERY_NOTE';
  end if;
  if p_update ? 'trackingUrl' and (jsonb_typeof(p_update->'trackingUrl')<>'string' or
    char_length(p_update->>'trackingUrl')>2000 or (p_update->>'trackingUrl') !~ '^https://[^[:space:]@]+$') then
    raise sqlstate 'PT422' using message='INVALID_DELIVERY_URL';
  end if;
  select shop_id into sid from public.orders where id=p_order_id;
  if not found then raise sqlstate 'PT404' using message='NOT_FOUND'; end if;
  perform 1 from public.shops where id=sid for update;
  select * into o from public.orders where id=p_order_id for update;
  select * into d from public.deliveries where order_id=p_order_id for update;
  if not found then raise sqlstate 'PT404' using message='NOT_FOUND'; end if;
  if o.fulfillment<>'delivery' or d.provider<>'manual' then
    raise sqlstate 'PT409' using message='NOT_MANUAL_DELIVERY';
  end if;
  -- Exact replay preserves metadata and timestamps, even after completion.
  if d.status::text=next_status then
    if (p_update ? 'feeSatang' and d.fee_satang is distinct from (p_update->>'feeSatang')::integer) or
       (p_update ? 'trackingUrl' and d.tracking_url is distinct from (p_update->>'trackingUrl')) or
       (p_update ? 'note' and d.note is distinct from (p_update->>'note')) then
      raise sqlstate 'PT409' using message='DELIVERY_ALREADY_RECORDED';
    end if;
    return jsonb_build_object('delivery',to_jsonb(d),'orderChanged',false);
  end if;
  if o.status not in ('courier_requested','in_transit') or
    not ((d.status in ('pending_admin','failed') and next_status='booked') or
         (d.status='booked' and next_status in ('in_transit','failed')) or
         (d.status='in_transit' and next_status in ('delivered','failed'))) then
    raise sqlstate 'PT409' using message='INVALID_DELIVERY_TRANSITION';
  end if;
  target := case when next_status='in_transit' then 'in_transit'::public.order_status
                 when next_status='delivered' then 'completed'::public.order_status else null end;
  if target='completed' and o.status<>'in_transit' then
    raise sqlstate 'PT409' using message='INVALID_ORDER_TRANSITION';
  end if;
  stamp := clock_timestamp();
  if target is not null and target<>o.status then
    update public.orders set status=target,updated_at=stamp,
      completed_at=case when target='completed' then stamp else completed_at end where id=o.id;
    changed_order := true;
  end if;
  update public.deliveries set status=next_status::public.delivery_status,
    fee_satang=case when p_update ? 'feeSatang' then (p_update->>'feeSatang')::integer else fee_satang end,
    tracking_url=case when p_update ? 'trackingUrl' then p_update->>'trackingUrl' else tracking_url end,
    note=case when p_update ? 'note' then p_update->>'note' else note end,
    updated_at=stamp where id=d.id returning * into d;
  return jsonb_build_object('delivery',to_jsonb(d),'orderChanged',changed_order);
end $$;
revoke all on function public.transition_manual_delivery(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.transition_manual_delivery(uuid,jsonb) to service_role;
