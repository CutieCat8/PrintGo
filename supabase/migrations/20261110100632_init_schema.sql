-- PrintGo initial schema.
-- Meaning of every name: docs/CONTRACTS.md sections 2 (enums) and 3 (tables).
--
-- Rules this file follows:
--   * Money is integer satang, never negative.
--   * Every table has row level security ON and NO policy. Only the server touches data, with the
--     service role, and it checks who may see what in code (CLAUDE.md rule 4).
--   * Style (src/lib/db/migration.test.ts parses this file): one column per line,
--     one table constraint per line, each starting with `constraint` / `unique` / `check`.

-- ============================== enums ==============================
create type public.order_status as enum ('submitted', 'awaiting_payment', 'paid', 'printing', 'ready', 'courier_requested', 'in_transit', 'completed', 'rejected', 'cancelled', 'expired');
create type public.fulfillment as enum ('pickup', 'delivery');
create type public.color_mode as enum ('bw', 'color');
create type public.paper as enum ('A4', 'A3');
create type public.sides as enum ('single', 'double');
create type public.shop_status as enum ('pending', 'active', 'suspended');
create type public.payment_status as enum ('pending', 'pending_review', 'verified', 'rejected');
create type public.payment_verifier as enum ('slipok', 'admin');
create type public.delivery_provider_name as enum ('manual', 'grab');
create type public.delivery_status as enum ('pending_admin', 'booked', 'in_transit', 'delivered', 'failed', 'cancelled');
create type public.message_sender as enum ('customer', 'shop', 'system');
create type public.settlement_status as enum ('pending', 'paid');
create type public.refund_status as enum ('pending', 'paid');
create type public.role as enum ('shop', 'admin');
create type public.service_unit as enum ('per_set', 'per_order');

-- ============================ order numbers ============================
-- PG-0001 ... PG-9999, then PG-10000 and on (lpad would cut longer numbers, hence the case).
create sequence public.order_no_seq;

create function public.next_order_no() returns text
  language sql
  volatile
  set search_path = ''
as $$
  select 'PG-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end
  from (select nextval('public.order_no_seq') as n) as s
$$;

-- Not an API: only the server (service role) may call it through the column default.
revoke execute on function public.next_order_no() from public, anon, authenticated;
grant execute on function public.next_order_no() to service_role;

create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================== people ==============================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  line_user_id text not null unique,
  display_name text not null,
  picture_url text
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  phone text not null,
  address text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  status public.shop_status not null default 'pending',
  is_paused boolean not null default false,
  accepts_delivery boolean not null default true,
  cutoff_minutes integer not null default 30 check (cutoff_minutes >= 0)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.role not null,
  shop_id uuid references public.shops (id),
  constraint profiles_shop_iff_shop_role check ((role = 'shop') = (shop_id is not null))
);

-- ============================ shop settings ============================
create table public.shop_hours (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  open_time time not null,
  close_time time not null,
  is_closed boolean not null default false,
  unique (shop_id, weekday),
  constraint shop_hours_close_after_open check (is_closed or close_time > open_time)
);

create table public.shop_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  color public.color_mode not null,
  paper public.paper not null,
  sides public.sides not null,
  price_per_page_satang integer not null check (price_per_page_satang > 0),
  unique (shop_id, color, paper, sides)
);

create table public.shop_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  min_pages integer not null check (min_pages >= 1),
  note text,
  unique (shop_id, min_pages)
);

-- Extra services a shop offers (binding, clear cover ...). price_satang null = "price by agreement".
-- The limit of 20 per shop is enforced by the API (CONTRACTS section 6.2).
create table public.shop_services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_satang integer check (price_satang > 0),
  unit public.service_unit not null,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- =============================== orders ===============================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_no text not null unique default public.next_order_no(),
  customer_id uuid not null references public.customers (id),
  shop_id uuid not null references public.shops (id),
  status public.order_status not null default 'submitted',
  fulfillment public.fulfillment not null,
  delivery_address text,
  delivery_lat double precision check (delivery_lat between -90 and 90),
  delivery_lng double precision check (delivery_lng between -180 and 180),
  delivery_recipient_name text,
  delivery_recipient_phone text,
  customer_note text check (char_length(customer_note) <= 500),
  requires_manual_price boolean not null,
  estimated_print_satang integer check (estimated_print_satang >= 0),
  estimated_services_satang integer check (estimated_services_satang >= 0),
  print_subtotal_satang integer check (print_subtotal_satang > 0),
  platform_fee_satang integer check (platform_fee_satang >= 0),
  delivery_fee_satang integer not null default 0 check (delivery_fee_satang >= 0),
  total_satang integer check (total_satang > 0),
  reject_reason text,
  response_deadline timestamptz not null,
  payment_deadline timestamptz,
  ready_in_minutes integer check (ready_in_minutes between 5 and 2880),
  estimated_ready_at timestamptz,
  ready_note text check (char_length(ready_note) <= 200),
  pickup_code text check (pickup_code ~ '^[0-9]{4,5}$'),
  paid_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint orders_delivery_needs_destination check (fulfillment = 'pickup' or (delivery_address is not null and delivery_lat is not null and delivery_lng is not null and delivery_recipient_name is not null and delivery_recipient_phone is not null)),
  constraint orders_price_fields_set_together check ((print_subtotal_satang is null) = (platform_fee_satang is null) and (print_subtotal_satang is null) = (total_satang is null)),
  constraint orders_total_adds_up check (total_satang is null or total_satang = print_subtotal_satang + platform_fee_satang + delivery_fee_satang),
  constraint orders_one_ready_time_before_payment check (paid_at is not null or ready_in_minutes is null or estimated_ready_at is null)
);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id),
  storage_path text not null,
  original_name text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0),
  page_count integer not null check (page_count >= 1),
  color public.color_mode not null,
  paper public.paper not null,
  sides public.sides not null,
  copies integer not null default 1 check (copies between 1 and 99),
  deleted_at timestamptz
);

-- Snapshot of the services chosen at order time: later edits by the shop do not touch old orders.
create table public.order_services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id),
  shop_service_id uuid references public.shop_services (id) on delete set null,
  name text not null,
  unit public.service_unit not null,
  unit_price_satang integer check (unit_price_satang > 0),
  order_file_id uuid references public.order_files (id),
  quantity integer not null check (quantity >= 1),
  constraint order_services_file_iff_per_set check ((unit = 'per_set') = (order_file_id is not null))
);

-- ============================ money movement ============================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id),
  amount_satang integer not null check (amount_satang > 0),
  status public.payment_status not null default 'pending',
  slip_path text,
  slip_ref text unique,
  verified_by public.payment_verifier,
  verified_at timestamptz,
  reject_reason text
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null unique references public.orders (id),
  provider public.delivery_provider_name not null,
  provider_ref text,
  status public.delivery_status not null,
  fee_satang integer check (fee_satang >= 0),
  tracking_url text,
  note text,
  updated_at timestamptz not null default now()
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id),
  order_id uuid not null unique references public.orders (id),
  amount_satang integer not null check (amount_satang > 0),
  status public.settlement_status not null default 'pending',
  paid_at timestamptz,
  proof_path text
);

-- One refund per order, so recording it from the state machine can be made idempotent.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null unique references public.orders (id),
  amount_satang integer not null check (amount_satang > 0),
  reason text not null,
  status public.refund_status not null default 'pending',
  paid_at timestamptz
);

-- ============================= messaging =============================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id),
  sender public.message_sender not null,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  push_sent_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_success_at timestamptz
);

create table public.webhook_events (
  id text primary key,
  source text not null,
  created_at timestamptz not null default now()
);

-- ============================== indexes ==============================
create index orders_shop_status_idx on public.orders (shop_id, status);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
-- the expiry sweep only ever looks at orders that are still waiting
create index orders_response_deadline_idx on public.orders (response_deadline) where status = 'submitted';
create index orders_payment_deadline_idx on public.orders (payment_deadline) where status = 'awaiting_payment';
create index order_files_order_idx on public.order_files (order_id);
create index order_services_order_idx on public.order_services (order_id);
create index shop_services_shop_idx on public.shop_services (shop_id);
create index payments_order_idx on public.payments (order_id);
-- an order can be paid once: at most one verified payment per order
create unique index payments_one_verified_per_order on public.payments (order_id) where status = 'verified';
create index settlements_shop_status_idx on public.settlements (shop_id, status);
create index messages_order_created_idx on public.messages (order_id, created_at);
create index messages_unread_idx on public.messages (order_id, sender) where read_at is null;
create index push_subscriptions_shop_idx on public.push_subscriptions (shop_id);

-- ============================== triggers ==============================
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger deliveries_set_updated_at before update on public.deliveries for each row execute function public.set_updated_at();

-- =========================== access control ===========================
alter table public.customers enable row level security;
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.shop_hours enable row level security;
alter table public.shop_pricing_rules enable row level security;
alter table public.shop_discount_tiers enable row level security;
alter table public.shop_services enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.order_services enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;
alter table public.settlements enable row level security;
alter table public.refunds enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.webhook_events enable row level security;

-- The browser keys (anon / authenticated) are only for sign-in. They get no table access at all,
-- now or for tables added later; RLS above is the second lock.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- The server (service role) is the only user of these tables. Grant it explicitly instead of
-- relying on the project's "Automatically expose new tables" Data API setting, which may be off.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- ============================== storage ==============================
-- All buckets are private. Customers upload with signed upload URLs, shops read with short-lived
-- signed URLs; no storage policy is needed because the server (service role) creates them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('order-files', 'order-files', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png']),
  ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg', 'image/png']),
  ('settlement-proofs', 'settlement-proofs', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
