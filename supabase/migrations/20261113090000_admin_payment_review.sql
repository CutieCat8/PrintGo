-- Used only by the authenticated admin service. Serializes with transition_order_finance.
create function public.review_order_payment(p_payment_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p public.payments%rowtype;
  o public.orders%rowtype;
  oid uuid;
  sid uuid;
  existing public.refunds%rowtype;
  stamp timestamptz;
begin
  if p_action is null or p_action not in ('reject','refund') or p_reason is null or
     char_length(btrim(p_reason)) not between 1 and 500 then
    raise sqlstate 'PT422' using message = 'INVALID_REVIEW';
  end if;
  select order_id into oid from public.payments where id=p_payment_id;
  if not found then raise sqlstate 'PT404' using message='NOT_FOUND'; end if;
  select shop_id into sid from public.orders where id=oid;
  perform 1 from public.shops where id=sid for update;
  select * into o from public.orders where id=oid for update;
  select * into p from public.payments where id=p_payment_id for update;
  stamp := clock_timestamp();
  if p_action='reject' then
    if p.status='rejected' and p.reject_reason=btrim(p_reason) then
      return jsonb_build_object('changed',false,'orderId',oid);
    end if;
    if p.status<>'pending_review' then raise sqlstate 'PT409' using message='INVALID_PAYMENT_STATUS'; end if;
    update public.payments set status='rejected',reject_reason=btrim(p_reason) where id=p.id;
  else
    -- Expiry is performed by transition() before reaching this persistence primitive.
    if o.status<>'expired' or o.paid_at is not null or p.slip_path is null or
       p.amount_satang is distinct from o.total_satang then
      raise sqlstate 'PT409' using message='INVALID_REFUND_CONTEXT';
    end if;
    select * into existing from public.refunds where order_id=oid;
    if found then
      if p.status='verified' and p.verified_by='admin' and existing.amount_satang=p.amount_satang then
        return jsonb_build_object('changed',false,'orderId',oid);
      end if;
      raise sqlstate 'PT409' using message='REFUND_EXISTS';
    end if;
    if p.status<>'pending_review' or exists(select 1 from public.payments x
        where x.order_id=oid and x.id<>p.id and x.status='verified') then
      raise sqlstate 'PT409' using message='INVALID_PAYMENT_STATUS';
    end if;
    update public.payments set status='verified',verified_by='admin',verified_at=stamp,
      reject_reason=null where id=p.id;
    insert into public.refunds(order_id,amount_satang,reason,status)
      values(oid,p.amount_satang,btrim(p_reason),'pending');
  end if;
  return jsonb_build_object('changed',true,'orderId',oid);
end $$;
revoke all on function public.review_order_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_order_payment(uuid,text,text) to service_role;
