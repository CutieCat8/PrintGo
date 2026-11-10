-- Sample data for development and the demo. EVERYTHING HERE IS MADE UP ("ตัวอย่างสมมติ"):
-- shop names, coordinates around Chiang Mai, prices and orders. Do not present any of it as real.
--
-- Runs after the migrations on `npm run db:reset`; that command empties the database first,
-- so this file does not need to be re-runnable on top of itself.
--
-- Fixed ids, handy with the dev auth stub (header `x-dev-user`, see src/lib/auth/index.ts):
--   customer:00000000-0000-4000-8000-0000000000c1
--   shop:00000000-0000-4000-8000-0000000000a1   (also a2, a3)
--   admin
-- Shop and admin sign-in accounts live in Supabase Auth, not here (see tasks Z4 and A5).

-- ============================== customer ==============================
insert into public.customers (id, line_user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000c1', 'U-sample-customer', 'ลูกค้าตัวอย่าง');

-- ============================== shops ==============================
insert into public.shops (id, name, phone, address, lat, lng, status, accepts_delivery) values
  ('00000000-0000-4000-8000-0000000000a1', 'ร้านตัวอย่าง A', '0800000001', 'ที่อยู่ตัวอย่างสมมติ A เชียงใหม่', 18.7953, 98.9534, 'active', true),
  ('00000000-0000-4000-8000-0000000000a2', 'ร้านตัวอย่าง B', '0800000002', 'ที่อยู่ตัวอย่างสมมติ B เชียงใหม่', 18.8003, 98.9505, 'active', true),
  ('00000000-0000-4000-8000-0000000000a3', 'ร้านตัวอย่าง C', '0800000003', 'ที่อยู่ตัวอย่างสมมติ C เชียงใหม่', 18.7885, 98.9918, 'active', true);

-- A: every day 09:00-20:00. B: 09:00-18:00, closed on Sunday (0). C: every day 10:00-22:00.
insert into public.shop_hours (shop_id, weekday, open_time, close_time, is_closed)
select h.shop_id, d, h.open_time, h.close_time, h.closed_sunday and d = 0
from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, time '09:00', time '20:00', false),
  ('00000000-0000-4000-8000-0000000000a2'::uuid, time '09:00', time '18:00', true),
  ('00000000-0000-4000-8000-0000000000a3'::uuid, time '10:00', time '22:00', false)
) as h(shop_id, open_time, close_time, closed_sunday)
cross join generate_series(0, 6) as d;

-- Same price list for A and B; C charges 10 satang more per page.
insert into public.shop_pricing_rules (shop_id, color, paper, sides, price_per_page_satang)
select s.shop_id, p.color::public.color_mode, p.paper::public.paper, p.sides::public.sides, p.price + s.extra
from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, 0),
  ('00000000-0000-4000-8000-0000000000a2'::uuid, 0),
  ('00000000-0000-4000-8000-0000000000a3'::uuid, 10)
) as s(shop_id, extra)
cross join (values
  ('bw', 'A4', 'single', 100), ('bw', 'A4', 'double', 80),
  ('color', 'A4', 'single', 500), ('color', 'A4', 'double', 400),
  ('bw', 'A3', 'single', 300), ('bw', 'A3', 'double', 250),
  ('color', 'A3', 'single', 1500), ('color', 'A3', 'double', 1200)
) as p(color, paper, sides, price);

-- From this many pages the shop sets the price itself (requires_manual_price).
insert into public.shop_discount_tiers (shop_id, min_pages, note) values
  ('00000000-0000-4000-8000-0000000000a1', 50, 'งานเกิน 50 หน้า ร้านเสนอราคาเอง'),
  ('00000000-0000-4000-8000-0000000000a2', 100, 'งานเกิน 100 หน้า ร้านเสนอราคาเอง'),
  ('00000000-0000-4000-8000-0000000000a3', 200, 'งานเกิน 200 หน้า ร้านเสนอราคาเอง');

-- price_satang null = "price by agreement"
insert into public.shop_services (id, shop_id, name, price_satang, unit, sort_order) values
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-0000000000a1', 'เย็บมุม', 500, 'per_order', 1),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-0000000000a1', 'ปกใส + ปกหลัง', 1500, 'per_set', 2),
  ('00000000-0000-4000-8000-000000000053', '00000000-0000-4000-8000-0000000000a1', 'เคลือบ', null, 'per_set', 3),
  ('00000000-0000-4000-8000-000000000054', '00000000-0000-4000-8000-0000000000a2', 'เข้าเล่มสันกาว', 4500, 'per_set', 1),
  ('00000000-0000-4000-8000-000000000055', '00000000-0000-4000-8000-0000000000a2', 'เจาะรู', 300, 'per_order', 2),
  ('00000000-0000-4000-8000-000000000056', '00000000-0000-4000-8000-0000000000a3', 'เข้าเล่มสันเกลียว', 3500, 'per_set', 1),
  ('00000000-0000-4000-8000-000000000057', '00000000-0000-4000-8000-0000000000a3', 'เข้าเล่มสันกาว', null, 'per_set', 2),
  ('00000000-0000-4000-8000-000000000058', '00000000-0000-4000-8000-0000000000a3', 'ปกใส', 1000, 'per_set', 3);

-- ============================== orders ==============================
-- Fee rule: max(300, ceil(5% x subtotal)). total = subtotal + fee + delivery.
-- e1 submitted, e2 awaiting payment, e3 paid, e4 printing (delivery), e5 ready, e6 completed.
-- order_no comes from the sequence, so they are PG-0001 .. PG-0006 on a fresh database.
insert into public.orders (
  id, created_at, customer_id, shop_id, status, fulfillment,
  delivery_address, delivery_lat, delivery_lng, delivery_recipient_name, delivery_recipient_phone,
  customer_note, requires_manual_price, estimated_print_satang, estimated_services_satang,
  print_subtotal_satang, platform_fee_satang, delivery_fee_satang, total_satang,
  response_deadline, payment_deadline, ready_in_minutes, estimated_ready_at, ready_note,
  pickup_code, paid_at, completed_at
) values
  -- e1: waiting for the shop. 10 pages b/w A4 single-sided = 10 x 100
  ('00000000-0000-4000-8000-0000000000e1', now() - interval '3 minutes',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'submitted', 'pickup',
   null, null, null, null, null,
   'ตัวอย่างสมมติ', false, 1000, 0,
   null, null, 0, null,
   now() + interval '12 minutes', null, null, null, null,
   null, null, null),
  -- e2: quote sent. 20 pages double-sided (20 x 80) + staples 500 = 2100, fee 300, total 2400
  ('00000000-0000-4000-8000-0000000000e2', now() - interval '10 minutes',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'awaiting_payment', 'pickup',
   null, null, null, null, null,
   null, false, 1600, 500,
   2100, 300, 0, 2400,
   now() + interval '5 minutes', now() + interval '25 minutes', 30, null, 'พร้อมรับเลย',
   null, null, null),
  -- e3: paid, big job (120 >= 100 pages, shop set the price: 11000, fee 550). Ready 15 min after payment
  ('00000000-0000-4000-8000-0000000000e3', now() - interval '20 minutes',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'paid', 'pickup',
   null, null, null, null, null,
   null, true, 12000, 0,
   11000, 550, 0, 11550,
   now() - interval '5 minutes', now() + interval '10 minutes', 15, now() + interval '10 minutes', null,
   '4821', now() - interval '5 minutes', null),
  -- e4: printing, delivery. 210 pages x 2 sets double-sided at C (420 x 90 = 37800) + spiral binding 2 x 3500
  -- = 44800 estimated; shop quoted 44000, fee 2200, delivery 6500, total 52700. Fixed ready time tomorrow noon
  ('00000000-0000-4000-8000-0000000000e4', now() - interval '2 hours',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a3', 'printing', 'delivery',
   'หอพักตัวอย่างสมมติ ห้อง 101 เชียงใหม่', 18.7960, 98.9600, 'ผู้รับตัวอย่าง', '0800000009',
   'ขอสันเกลียวสีดำ', true, 37800, 7000,
   44000, 2200, 6500, 52700,
   now() - interval '100 minutes', now() - interval '70 minutes', null,
   date_trunc('day', now() + interval '1 day') + interval '5 hours', 'งานใหญ่ ต้องรับพรุ่งนี้ช่วงเที่ยง',
   '9136', now() - interval '60 minutes', null),
  -- e5: ready for pickup. 5 pages colour A4 single-sided = 2500, fee 300, total 2800
  ('00000000-0000-4000-8000-0000000000e5', now() - interval '1 hour',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'ready', 'pickup',
   null, null, null, null, null,
   null, false, 2500, 0,
   2500, 300, 0, 2800,
   now() - interval '45 minutes', now() - interval '15 minutes', null, now() - interval '10 minutes', null,
   '7305', now() - interval '40 minutes', null),
  -- e6: done yesterday. 30 pages single-sided = 3000, fee 300, total 3300
  ('00000000-0000-4000-8000-0000000000e6', now() - interval '27 hours',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'completed', 'pickup',
   null, null, null, null, null,
   null, false, 3000, 0,
   3000, 300, 0, 3300,
   now() - interval '26 hours 45 minutes', now() - interval '26 hours 15 minutes', null, now() - interval '25 hours', null,
   '2480', now() - interval '26 hours', now() - interval '24 hours');

insert into public.order_files (id, order_id, storage_path, original_name, mime, size_bytes, page_count, color, paper, sides, copies) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'sample/e1.pdf', 'ตัวอย่าง-10หน้า.pdf', 'application/pdf', 120000, 10, 'bw', 'A4', 'single', 1),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 'sample/e2.pdf', 'ตัวอย่าง-20หน้า.pdf', 'application/pdf', 240000, 20, 'bw', 'A4', 'double', 1),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', 'sample/e3.pdf', 'ตัวอย่าง-120หน้า.pdf', 'application/pdf', 1400000, 120, 'bw', 'A4', 'single', 1),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e4', 'sample/e4.pdf', 'ตัวอย่าง-รายงาน210หน้า.pdf', 'application/pdf', 9000000, 210, 'bw', 'A4', 'double', 2),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e5', 'sample/e5.png', 'ตัวอย่าง-สี.png', 'image/png', 800000, 5, 'color', 'A4', 'single', 1),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000e6', 'sample/e6.pdf', 'ตัวอย่าง-30หน้า.pdf', 'application/pdf', 350000, 30, 'bw', 'A4', 'single', 1);

-- Services chosen on e2 (staples, once per order) and e4 (spiral binding, per set: 2 sets of file f4)
insert into public.order_services (order_id, shop_service_id, name, unit, unit_price_satang, order_file_id, quantity) values
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000051', 'เย็บมุม', 'per_order', 500, null, 1),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-000000000056', 'เข้าเล่มสันเกลียว', 'per_set', 3500, '00000000-0000-4000-8000-0000000000f4', 2);

-- ============================== money ==============================
insert into public.payments (order_id, amount_satang, status, verified_by, verified_at) values
  ('00000000-0000-4000-8000-0000000000e2', 2400, 'pending', null, null),
  ('00000000-0000-4000-8000-0000000000e3', 11550, 'verified', 'admin', now() - interval '5 minutes'),
  ('00000000-0000-4000-8000-0000000000e4', 52700, 'verified', 'admin', now() - interval '60 minutes'),
  ('00000000-0000-4000-8000-0000000000e5', 2800, 'verified', 'admin', now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-0000000000e6', 3300, 'verified', 'admin', now() - interval '26 hours');

-- One settlement per paid order; the shop gets the print subtotal, the fee stays with PrintGo.
insert into public.settlements (shop_id, order_id, amount_satang) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e3', 11000),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e4', 44000),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5', 2500),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e6', 3000);

-- ============================== chat on e4 ==============================
insert into public.messages (order_id, sender, body, read_at, created_at) values
  ('00000000-0000-4000-8000-0000000000e4', 'customer', 'ขอสันเกลียวสีดำนะคะ', now() - interval '100 minutes', now() - interval '110 minutes'),
  ('00000000-0000-4000-8000-0000000000e4', 'shop', 'ได้ค่ะ งานนี้วันนี้ยังไม่เสร็จ จะเสร็จพรุ่งนี้ช่วงเที่ยงนะคะ', null, now() - interval '30 minutes'),
  ('00000000-0000-4000-8000-0000000000e4', 'system', 'ร้านปรับเวลาเสร็จเป็นพรุ่งนี้ 12:00 น.', null, now() - interval '29 minutes');
