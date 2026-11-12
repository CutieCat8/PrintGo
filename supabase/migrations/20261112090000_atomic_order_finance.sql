-- Internal persistence primitive of transition(), not a browser-facing API.
-- Row locks and all writes below are in the RPC's single PostgreSQL transaction.
create function public.transition_order_finance(
  p_order_id uuid,
  p_from public.order_status[],
  p_to public.order_status,
  p_actor text,
  p_values jsonb,
  p_refund_satang integer default null,
  p_payment_id uuid default null,
  p_slip_ref text default null,
  p_verifier public.payment_verifier default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  p public.payments%rowtype;
  shop uuid;
  code text;
  reason text;
  amount integer;
  stamp timestamptz;
begin
  if p_actor is null or p_to is null then
    raise sqlstate 'PT422' using message = 'INVALID_TRANSITION';
  end if;
  select shop_id into shop from public.orders where id = p_order_id;
  if not found then raise sqlstate 'PT404' using message = 'NOT_FOUND'; end if;
  -- All financial transitions lock in the same order: shop, order, payment.
  -- The shop lock also serializes pickup-code allocation across different orders.
  perform 1 from public.shops where id = shop for update;
  select * into o from public.orders where id = p_order_id for update;

  if p_payment_id is not null then
    if p_to <> 'paid' or p_verifier is null or
       not ((p_actor = 'system' and p_verifier = 'slipok') or
            (p_actor = 'admin' and p_verifier = 'admin')) then
      raise sqlstate 'PT422' using message = 'INVALID_PAYMENT_CONTEXT';
    end if;
    select * into p from public.payments where id = p_payment_id and order_id = o.id for update;
    if not found then raise sqlstate 'PT404' using message = 'NOT_FOUND'; end if;
    if p_verifier = 'slipok' and (p_slip_ref is null or btrim(p_slip_ref) = '') then
      raise sqlstate 'PT422' using message = 'INVALID_SLIP_REFERENCE';
    end if;
    -- A replay cannot rewrite the verifier, timestamp, code, totals or settlement.
    if p.status = 'verified' then
      if o.paid_at is null or p.amount_satang is distinct from o.total_satang or
         (p_slip_ref is not null and p.slip_ref is not null and p.slip_ref is distinct from p_slip_ref) or
         not exists (select 1 from public.settlements s where s.order_id = o.id
                     and s.shop_id = o.shop_id and s.amount_satang = o.print_subtotal_satang) then
        raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
      end if;
      return jsonb_build_object('order', to_jsonb(o), 'changed', false);
    end if;
    if p.status <> 'pending_review' or p.slip_path is null or
       p.amount_satang is distinct from o.total_satang then
      raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
    end if;
  elsif p_verifier is not null or p_slip_ref is not null then
    raise sqlstate 'PT422' using message = 'INVALID_PAYMENT_CONTEXT';
  end if;
  stamp := clock_timestamp(); -- after every lock, including a potentially blocked payment row

  if p_from is null or cardinality(p_from) = 0 or not (o.status = any(p_from)) then
    raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
  end if;

  if p_to = 'paid' then
    if o.status <> 'awaiting_payment' or p_actor not in ('system', 'admin') or
       o.payment_deadline is null or o.payment_deadline <= stamp then
      raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
    end if;
    if o.total_satang is null or o.print_subtotal_satang is null then
      raise sqlstate 'PT422' using message = 'MISSING_QUOTE';
    end if;
    -- Legacy transition() callers may already have a verified payment. New callers
    -- must use finalizePayment so the payment write is included in this transaction.
    if p_payment_id is null and not exists (
      select 1 from public.payments x where x.order_id = o.id
      and x.status = 'verified' and x.amount_satang = o.total_satang
    ) then
      raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
    end if;
    code := p_values->>'pickup_code';
    if code is null or code !~ '^[1-9][0-9]{3,4}$' or p_refund_satang is not null then
      raise sqlstate 'PT422' using message = 'INVALID_PAID_VALUES';
    end if;
    if exists (select 1 from public.orders x where x.shop_id = o.shop_id and x.id <> o.id
               and x.status in ('submitted','awaiting_payment','paid','printing','ready','courier_requested','in_transit')
               and x.pickup_code = code) then
      raise sqlstate 'PT410' using message = 'PICKUP_CODE_COLLISION';
    end if;
    if p_payment_id is not null then
      update public.payments set status = 'verified', verified_by = p_verifier,
        verified_at = stamp, slip_ref = coalesce(p_slip_ref, slip_ref), reject_reason = null
        where id = p_payment_id;
    end if;
    update public.orders set status = 'paid', paid_at = stamp, pickup_code = code,
      estimated_ready_at = case when ready_in_minutes is null then estimated_ready_at
        else stamp + make_interval(mins => ready_in_minutes) end
      where id = o.id returning * into o;
    -- Do not silently accept a pre-existing settlement with the wrong amount.
    insert into public.settlements (shop_id, order_id, amount_satang, status)
      values (o.shop_id, o.id, o.print_subtotal_satang, 'pending');
  elsif (p_to = 'cancelled' and p_actor = 'admin' and
         o.status in ('paid','printing','ready','courier_requested','in_transit')) or
        (p_to = 'rejected' and p_actor = 'shop' and o.status in ('paid','printing')) then
    if p_payment_id is not null then raise sqlstate 'PT422' using message = 'INVALID_PAYMENT_CONTEXT'; end if;
    reason := btrim(p_values->>'reject_reason');
    amount := coalesce(p_refund_satang, o.total_satang);
    if reason is null or char_length(reason) not between 1 and 500 or
       o.total_satang is null or amount is null or amount <= 0 or amount > o.total_satang or
       (p_actor <> 'admin' and p_refund_satang is not null) then
      raise sqlstate 'PT422' using message = 'INVALID_REFUND';
    end if;
    update public.orders set status = p_to, reject_reason = reason where id = o.id returning * into o;
    insert into public.refunds (order_id, amount_satang, reason, status)
      values (o.id, amount, reason, 'pending');
  else
    raise sqlstate 'PT409' using message = 'ORDER_INVALID_TRANSITION';
  end if;
  return jsonb_build_object('order', to_jsonb(o), 'changed', true);
end;
$$;

revoke all on function public.transition_order_finance(uuid, public.order_status[], public.order_status, text, jsonb, integer, uuid, text, public.payment_verifier) from public, anon, authenticated;
grant execute on function public.transition_order_finance(uuid, public.order_status[], public.order_status, text, jsonb, integer, uuid, text, public.payment_verifier) to service_role;
