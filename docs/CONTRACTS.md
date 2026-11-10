# PrintGo — สัญญากลาง (CONTRACTS)

เจ้าของ: **ซี** · แก้ไฟล์นี้ได้ผ่าน PR ที่ซีอนุมัติเท่านั้น · agent ห้ามแก้เอง ถ้าเห็นว่าขาด/ผิด ให้ถามมนุษย์
โค้ดกลาง (Zod schema + TypeScript type) อยู่ที่ `src/lib/db/types.ts` ต้อง **ตรงกับไฟล์นี้ทุกตัวอักษร** (task Z2)

## 1. กติกาทั่วไป
- ชื่อใน DB และ JSON ของ API เป็น `snake_case` · ชื่อตัวแปรใน TypeScript เป็น `camelCase` (แปลงที่ขอบ API ผ่านฟังก์ชันเดียว `toApi()/fromDb()`; **JSON ของ API ใช้ camelCase** ตามข้อ 6 ด้านล่าง)
- เวลาเป็น ISO 8601 UTC (`2026-11-12T08:30:00.000Z`) แสดงผลเป็นเวลาไทย (`Asia/Bangkok`) ที่หน้าจอ
- id เป็น `uuid` ยกเว้นระบุเป็นอย่างอื่น · เงินเป็น `integer` สตางค์ · ไม่มีค่าติดลบ
- ข้อผิดพลาดของ API ทุกตัว: HTTP status ที่เหมาะสม + body
  ```json
  { "error": { "code": "ORDER_INVALID_TRANSITION", "message": "ภาษาไทยที่แสดงให้ผู้ใช้ได้", "details": {} } }
  ```
  รหัสที่ใช้: `UNAUTHENTICATED`(401) `FORBIDDEN`(403) `NOT_FOUND`(404) `VALIDATION_ERROR`(422) `ORDER_INVALID_TRANSITION`(409) `SHOP_CLOSED`(409) `SHOP_PAUSED`(409) `MANUAL_PRICE_REQUIRED`(409) `PAYMENT_DUPLICATE_SLIP`(409) `PAYMENT_AMOUNT_MISMATCH`(409) `CHAT_CLOSED`(409) `ALREADY_REGISTERED`(409) `RATE_LIMITED`(429) `INTERNAL`(500)
- สำเร็จ: HTTP 200/201 + body ตามที่ระบุ (ไม่ห่อด้วย `data`)

## 2. Enum
```
OrderStatus   = submitted | awaiting_payment | paid | printing | ready
              | courier_requested | in_transit | completed
              | rejected | cancelled | expired
Fulfillment   = pickup | delivery
ColorMode     = bw | color
Paper         = A4 | A3
Sides         = single | double
ShopStatus    = pending | active | suspended
PaymentStatus = pending | pending_review | verified | rejected
PaymentVerifier = slipok | admin
DeliveryProviderName = manual | grab
DeliveryStatus = pending_admin | booked | in_transit | delivered | failed | cancelled
MessageSender = customer | shop | system
SettlementStatus = pending | paid
RefundStatus  = pending | paid
Role          = shop | admin
ServiceUnit   = per_set | per_order
```

## 3. ตารางฐานข้อมูล (Postgres / Supabase)
ทุกตารางมี `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()` (เว้นแต่ระบุ) · เปิด RLS ทุกตาราง **ไม่สร้าง policy** (เซิร์ฟเวอร์ใช้ service role)

| ตาราง | คอลัมน์ (ชนิด) |
|---|---|
| `profiles` | `auth_user_id uuid unique → auth.users`, `role Role`, `shop_id uuid null → shops` |
| `customers` | `line_user_id text unique`, `display_name text`, `picture_url text null` |
| `shops` | `name text`, `phone text`, `address text`, `lat float8`, `lng float8`, `status ShopStatus default 'pending'`, `is_paused bool default false`, `accepts_delivery bool default true`, `cutoff_minutes int default 30` |
| `shop_hours` | `shop_id`, `weekday int (0=อาทิตย์..6)`, `open_time time`, `close_time time`, `is_closed bool default false` · unique(shop_id, weekday) · ช่วงเปิดเดียวต่อวัน ไม่ข้ามเที่ยงคืน |
| `shop_pricing_rules` | `shop_id`, `color ColorMode`, `paper Paper`, `sides Sides`, `price_per_page_satang int` · unique(shop_id,color,paper,sides) |
| `shop_discount_tiers` | `shop_id`, `min_pages int`, `note text null` · ถ้า "จำนวนหน้ารวมทั้งออเดอร์ (คูณจำนวนชุด)" ≥ `min_pages` ของ tier ใด → ต้องกรอกราคาเอง |
| `shop_services` | `shop_id`, `name text` (1–60 ตัวอักษร), `price_satang int null` (null = "ราคาตามตกลง"; ถ้ามีค่าต้อง > 0), `unit ServiceUnit` (`per_set` = คิดต่อชุดของไฟล์ที่เลือก · `per_order` = คิดครั้งเดียวต่อออเดอร์), `is_active bool default true`, `sort_order int default 0` · ไม่เกิน 20 รายการต่อร้าน (API ตรวจ) · D22 |
| `orders` | `order_no text unique` (รูปแบบ `PG-` + เลข 4 หลักวิ่ง), `customer_id`, `shop_id`, `status OrderStatus default 'submitted'`, `fulfillment Fulfillment`, `delivery_address text null`, `delivery_lat float8 null`, `delivery_lng float8 null`, `delivery_recipient_name text null`, `delivery_recipient_phone text null` (บังคับเมื่อ `fulfillment=delivery`; ส่งให้ลูกค้าเจ้าของและแอดมินเท่านั้น **ร้านไม่เห็น**), `customer_note text null`, `requires_manual_price bool`, `estimated_print_satang int null` (ค่าปริ้นล้วน), `estimated_services_satang int null` (บริการเสริมที่มีราคา; ตั้งตอนสร้างออเดอร์เสมอ เป็น 0 ถ้าไม่เลือกบริการ), `print_subtotal_satang int null` (ร้านยืนยัน; **= ค่าปริ้น + บริการเสริม**), `platform_fee_satang int null`, `delivery_fee_satang int default 0`, `total_satang int null`, `reject_reason text null`, `response_deadline timestamptz`, `payment_deadline timestamptz null`, `ready_in_minutes int null` (ร้านเลือกแบบ "นับจากตอนชำระเงิน"), `estimated_ready_at timestamptz null` (เวลาเสร็จประมาณ; ตั้งตรงตอนยืนยันแบบเวลาตายตัว หรือคำนวณตอน `paid`), `ready_note text null` (≤ 200 ตัวอักษร), `pickup_code text null` (ตัวเลข 4 หลัก 1000–9999 เช่น `4821` ไม่มีตัวอักษร จึงไม่สับสนกับเลขออเดอร์ `PG-0012`; สร้างโดยระบบตอน `paid` ทุกออเดอร์; ไม่ซ้ำกับออเดอร์ที่ยังไม่จบของร้านเดียวกัน; ส่งให้ลูกค้าเฉพาะ `fulfillment=pickup`; **ร้านไม่เห็น**), `paid_at`, `completed_at`, `updated_at` |
| `order_files` | `order_id`, `storage_path text`, `original_name text`, `mime text`, `size_bytes int`, `page_count int`, `color color ColorMode`, `paper Paper`, `sides Sides`, `copies int default 1`, `deleted_at timestamptz null` |
| `order_services` | `order_id`, `shop_service_id uuid null` (→ `shop_services` on delete set null), `name text`, `unit ServiceUnit`, `unit_price_satang int null`, `order_file_id uuid null` (บังคับเมื่อ `per_set`; null เมื่อ `per_order`), `quantity int` (`per_set` = `copies` ของไฟล์นั้นตอนสั่ง; `per_order` = 1) · **snapshot ชื่อ/ราคา ณ ตอนสั่ง** ร้านแก้ทีหลังไม่กระทบออเดอร์เก่า · `per_set` หนึ่งแถวต่อ (บริการ, ไฟล์) |
| `payments` | `order_id`, `amount_satang int`, `status PaymentStatus default 'pending'`, `slip_path text null`, `slip_ref text null unique` (เลขอ้างอิงในสลิป), `verified_by PaymentVerifier null`, `verified_at null`, `reject_reason text null` |
| `deliveries` | `order_id unique`, `provider DeliveryProviderName`, `provider_ref text null`, `status DeliveryStatus`, `fee_satang int null`, `tracking_url text null`, `note text null`, `updated_at` |
| `messages` | `order_id`, `sender MessageSender`, `body text`, `read_at timestamptz null` (เวลาที่ **อีกฝ่าย** เปิดอ่าน; ข้อความ `system` ไม่นับเป็น unread) · `push_sent_at timestamptz null` (ตั้งเมื่อส่ง LINE push สำหรับข้อความนี้แล้ว ใช้กันส่งซ้ำ) |
| `settlements` | `shop_id`, `order_id unique`, `amount_satang int` (= `print_subtotal_satang`), `status SettlementStatus default 'pending'`, `paid_at null`, `proof_path text null` · สร้างตอน `paid` แต่ **แสดง/โอนได้เฉพาะเมื่อ `orders.status='completed'`**; แถวของออเดอร์ที่ `rejected`/`cancelled` ให้ข้าม (ไม่ต้องมีสถานะใหม่) |
| `refunds` | `order_id`, `amount_satang int` (ปกติ = `total_satang`; แอดมินกำหนดน้อยกว่าได้ตอนยกเลิก ห้ามเกิน), `reason text`, `status RefundStatus default 'pending'`, `paid_at null` |
| `push_subscriptions` | `shop_id`, `auth_user_id`, `endpoint text unique`, `p256dh text`, `auth text`, `user_agent text null`, `last_success_at timestamptz null` · ลบแถวเมื่อ push service ตอบว่าหมดอายุ (404/410) |
| `webhook_events` | `id text pk` (event id จากผู้ให้บริการ), `source text`, `created_at` |

ดัชนีขั้นต่ำ: `orders(shop_id,status)`, `orders(customer_id,created_at desc)`, `order_files(order_id)`, `shop_services(shop_id)`, `order_services(order_id)`, `messages(order_id,created_at)`, `messages(order_id,sender) where read_at is null`
Storage bucket: `order-files` (private) · `payment-slips` (private) · `settlement-proofs` (private)
เส้นทางไฟล์: `order-files/{orderId}/{uuid}-{ชื่อที่ sanitize แล้ว}` (ก่อนสร้างออเดอร์ใช้ `order-files/pending/{customerId}/{uuid}-{ชื่อ}` แล้วย้ายเข้า `{orderId}/` ตอนสร้างออเดอร์; ไฟล์ `pending` ค้างเกิน 24 ชม. ถูกลบ) · สลิป `payment-slips/{orderId}/{uuid}.{ext}`

## 4. State machine ออเดอร์ (บังคับผ่าน `transition()`)
| จาก | ไป | ใครทำได้ | เงื่อนไข / ผลข้างเคียง |
|---|---|---|---|
| `submitted` | `awaiting_payment` | ร้าน (confirm) | ตั้ง `print_subtotal_satang`, คำนวณ `platform_fee_satang`/`total_satang`, ตั้ง `payment_deadline`; **ต้องมีเวลาเสร็จ**: `ready_in_minutes` หรือ `estimated_ready_at` อย่างใดอย่างหนึ่ง (D19); ถ้า `requires_manual_price` (ส่วนลดปริมาณ หรือมีบริการเสริมราคาตามตกลง) ต้องส่งราคามาด้วย → notify `quote_ready` |
| `submitted` | `rejected` | ร้าน | ต้องมี `reject_reason` → notify `order_rejected` |
| `submitted` | `expired` | ระบบ | เลย `response_deadline` → notify `order_expired` |
| `submitted`,`awaiting_payment` | `cancelled` | ลูกค้า | → notify |
| `awaiting_payment` | `expired` | ระบบ | เลย `payment_deadline` → notify `order_expired` |
| `awaiting_payment` | `paid` | ระบบ (สลิปผ่าน) หรือแอดมิน (อนุมัติสลิปด้วยมือ) | ตั้ง `paid_at`, `pickup_code`; ถ้า `ready_in_minutes` มีค่า → `estimated_ready_at = paid_at + ready_in_minutes` (เก็บ `ready_in_minutes` ไว้เป็นประวัติ); สร้าง `settlements` แถว pending → notify `payment_verified` |
| `paid` | `printing` | ร้าน | notify `printing` |
| `paid`,`printing`,`ready`,`courier_requested`,`in_transit` | `cancelled` | แอดมินเท่านั้น (ลูกค้ายกเลิกหลังจ่ายเองไม่ได้ — D19) | สร้าง `refunds` pending (`amount` = `refundSatang` ที่แอดมินระบุ ไม่เกิน `total_satang` ไม่ระบุ = คืนเต็ม) → notify `order_cancelled` · ใช้กับกรณีไรเดอร์ล้มเหลว/ลูกค้าไม่มารับ ฯลฯ |
| `paid`,`printing` | `rejected` | ร้าน (กรณีเปิดไฟล์ไม่ได้ ฯลฯ) | ต้องมีเหตุผล + สร้าง `refunds` pending → notify `order_rejected` |
| `printing` | `ready` | ร้าน | notify `ready` (ถ้า pickup แสดง `pickup_code`) |
| `ready` | `completed` | ร้าน (กรอกรหัสรับงานถูกต้อง) หรือแอดมิน (ปิดงานเองเมื่อลูกค้าไม่มารับ/มีข้อโต้แย้ง) | เฉพาะ `fulfillment=pickup` → ตั้ง `completed_at` |
| `ready` | `courier_requested` | ระบบ (ทันทีหลังร้านกด mark-ready ของออเดอร์ delivery) หรือแอดมิน | เฉพาะ `fulfillment=delivery` → `createDeliveryForOrder()` → notify |
| `courier_requested` | `in_transit` | ระบบ/แอดมิน | |
| `in_transit` | `completed` | ระบบ/แอดมิน | ตั้ง `completed_at` |
ห้ามข้ามขั้นนอกตารางนี้ · การเปลี่ยนต้องเป็น **conditional atomic update** (`update … where id=$1 and status=$from returning *`) ถ้าไม่มีแถวคืน → `ORDER_INVALID_TRANSITION`
สถานะปลายทาง: `completed`, `rejected`, `cancelled`, `expired`

## 5. การคำนวณเงิน (`src/lib/domain/pricing`)
```
pagesForFile      = page_count × copies
totalPages        = Σ pagesForFile
filePrice         = pagesForFile × price_per_page_satang(color,paper,sides)   // ไม่มีกติกาที่ตรง → ร้านนั้นไม่รองรับชุดค่านี้ → error
estimatedPrint    = Σ filePrice                                           // ค่าปริ้นล้วน
servicesEstimate  = Σ บริการที่เลือก: per_set → unit_price × copies ของแต่ละไฟล์ที่เลือก · per_order → unit_price × 1   // เฉพาะบริการที่มีราคา
requiresManual    = ร้านมี discount tier ที่ min_pages ≤ totalPages  หรือ  มีบริการที่เลือกซึ่งราคา = null (ตามตกลง)
printSubtotal     = (ร้านยืนยัน; รวมบริการเสริมแล้ว) ถ้า requiresManual: ราคาที่ร้านกรอก · ไม่งั้น: estimatedPrint + servicesEstimate หรือที่ร้านแก้
platformFee       = max(300, ceil(PLATFORM_FEE_RATE × printSubtotal))    // สตางค์; ceil หลังคูณเสมอ; printSubtotal รวมบริการเสริมแล้ว ไม่รวมค่าส่ง (D22)
deliveryFee       = fulfillment==delivery ? ค่าส่ง : 0
total             = printSubtotal + platformFee + deliveryFee
shopPayout        = printSubtotal                                          // ร้านได้ค่าปริ้นเต็ม ค่าบริการเป็นรายได้ PrintGo
```
ตัวอย่างสมมติ (ใช้เป็น test): 22 บาท → fee 3 บาท (ขั้นต่ำ) · 120 บาท → 6 บาท (5%) · 600 บาท → 30 บาท · ค่าปริ้น 120 + เข้าเล่ม 2 ชุด × 35 = 190 บาท → fee 9.50 บาท ลูกค้าจ่าย 199.50 บาท
`estimatedPrint` (ค่าปริ้นล้วน) และ `estimatedServices` (บริการเสริม) ตอนสร้างออเดอร์ ยังไม่รวมค่าบริการแพลตฟอร์ม/ค่าส่งจนกว่าร้านยืนยัน (แต่ `/estimate` คืนค่าประมาณให้ลูกค้าดูได้)

## 6. API (ลูกค้า/ร้าน/แอดมิน)
ลูกค้า: header `Authorization: Bearer <LIFF ID token>` → `requireCustomer()` · ร้าน/แอดมิน: คุกกี้ session ของ Supabase → `requireShop()` / `requireAdmin()`
ฟิลด์ใน JSON เป็น camelCase · `*Satang` = เงินเป็นสตางค์

### 6.1 ลูกค้า (`/api/liff/*`, เจ้าของ: พลุ)
| Method + Path | Request | Response |
|---|---|---|
| `POST /api/liff/uploads/sign` | `{ files: [{ name, mime, sizeBytes }] }` (mime ∈ pdf/jpeg/png, ≤ O6) | `[{ path, uploadUrl, token }]` (signed upload ของ Supabase Storage) |
| `GET /api/liff/shops?lat&lng` | `lat`/`lng` ไม่บังคับ (ส่งทั้งคู่หรือไม่ส่งเลย); ไม่ส่ง → `distanceKm=null` เรียงตามชื่อ · แสดงเฉพาะร้าน `active` ที่มีกติการาคาอย่างน้อย 1 รายการ | `[{ id, name, address, distanceKm\|null, isOpen, opensAt, closesAt, isPaused, acceptsDelivery, startingPriceSatang, services:[{ id, name, priceSatang\|null, unit }] }]` (`services` = เฉพาะ `is_active` เรียงตาม `sort_order`) เรียงใกล้→ไกล (ร้าน `active` เท่านั้น) |
| `POST /api/liff/estimate` | `{ shopId, fulfillment, deliveryLat?, deliveryLng?, files:[{ pageCount, color, paper, sides, copies }], services?:[{ serviceId, fileIndexes? }] }` (`fileIndexes` = ลำดับไฟล์ใน `files` ที่ใช้บริการ `per_set`; ไม่ส่ง = ทุกไฟล์; `per_order` ไม่ต้องมี · `deliveryLat/Lng` บังคับเมื่อ `fulfillment=delivery` ไม่งั้น `VALIDATION_ERROR` ใช้คำนวณค่าส่ง) | `{ requiresManualPrice, estimatedPrintSatang\|null, servicesSatang\|null, serviceLines:[{ serviceId, name, unit, unitPriceSatang\|null, quantity, lineTotalSatang\|null }], platformFeeSatang\|null, deliveryFeeSatang, totalSatang\|null }` (ถ้า manual → ค่าที่ขึ้นกับราคาเป็น null) |
| `POST /api/liff/orders` | `{ shopId, fulfillment, deliveryAddress?, deliveryLat?, deliveryLng?, deliveryRecipientName?, deliveryRecipientPhone?, customerNote?, files:[{ path, originalName, mime, sizeBytes, pageCount, color, paper, sides, copies }], services?:[{ serviceId, fileIndexes? }] }` | `Order` (status `submitted`) · error `SHOP_CLOSED`/`SHOP_PAUSED` · `deliveryAddress/Lat/Lng` และ `deliveryRecipientName/Phone` บังคับเมื่อ `fulfillment=delivery` (ไม่งั้น `VALIDATION_ERROR`) |
| `GET /api/liff/orders` | – | `Order[]` ของฉัน ใหม่→เก่า |
| `GET /api/liff/orders/:id` | – | `OrderDetail` (รวม files, services, payment, delivery, shop ย่อ) |
| `POST /api/liff/orders/:id/cancel` | – | `Order` |
| `GET /api/liff/orders/:id/messages` | `?after=<iso>` | `Message[]` |
| `POST /api/liff/orders/:id/messages` | `{ body }` (≤ 1000 ตัวอักษร) · ออเดอร์สถานะปลายทาง → `CHAT_CLOSED` | `Message` |
| `POST /api/liff/orders/:id/messages/read` | – (ตั้ง `read_at` ให้ข้อความจากร้านที่ยังไม่อ่านทั้งหมดของออเดอร์นี้) | `{ unreadMessageCount: 0 }` |
| `GET /api/liff/chats` | – (รายการห้องแชทของฉัน: ออเดอร์ที่ยังไม่จบ + ที่จบแล้วแต่ยังมีข้อความ; ใหม่→เก่าตามข้อความล่าสุด) | `{ totalUnread, chats:[{ orderId, orderNo, shopName, status, isClosed, lastMessage:{ sender, body, createdAt }\|null, unreadMessageCount }] }` |

### 6.2 ร้าน (`/api/shop/*`, เจ้าของ: พลุ)
ร้านสถานะ `pending` (สมัครแล้วรออนุมัติ) เรียกได้เฉพาะ `me`, `register`, `profile`, `hours`, `pricing`, `services`, `push/*` (ตั้งค่าร้านรอได้) · ที่เหลือ (orders, chats) ต้องเป็น `active` ไม่งั้น `FORBIDDEN` · `register`/`me` ใช้ `requireAuthUser` ที่เหลือใช้ `requireShop`
| Method + Path | Request | Response |
|---|---|---|
| `GET /api/shop/orders?status=` | `status` คั่นด้วย `,` ได้ | `Order[]` ของร้านฉัน |
| `GET /api/shop/orders/:id` | – | `OrderDetail` (ไม่มี `pickupCode`, ไม่มี `deliveryRecipient*`) |
| `GET /api/shop/orders/:id/files/:fileId/url?mode=view\|download` | `mode` default `view` (เปิดในเบราว์เซอร์/พิมพ์จากแท็บนั้นได้) · `download` = ให้ดาวน์โหลดเป็นไฟล์ (D20) | `{ url, expiresInSeconds }` (signed, 5 นาที) |
| `POST /api/shop/orders/:id/confirm` | `{ printSubtotalSatang?, readyInMinutes? \| estimatedReadyAt?, readyNote? }` (ราคาบังคับถ้า `requiresManualPrice` · **ต้องมีเวลาเสร็จอย่างใดอย่างหนึ่ง** ไม่งั้น `VALIDATION_ERROR` · `readyInMinutes` ∈ 5–2880 · `estimatedReadyAt` ต้องอยู่ในอนาคต · ห้ามส่งทั้งคู่) | `Order` |
| `POST /api/shop/orders/:id/eta` | `{ estimatedReadyAt, readyNote? }` (เฉพาะสถานะ `paid`/`printing`; ต้องอยู่ในอนาคต → อัปเดต `estimated_ready_at` (ไม่แตะ `ready_in_minutes` เดิม) + notify `eta_changed` + ข้อความ `system` ในแชท) | `Order` |
| `POST /api/shop/orders/:id/reject` | `{ reason }` | `Order` |
| `POST /api/shop/orders/:id/start-printing` | – | `Order` |
| `POST /api/shop/orders/:id/mark-ready` | – | `Order` |
| `POST /api/shop/orders/:id/complete` | `{ pickupCode }` (ตัดช่องว่าง; ต้องตรงกับ `pickup_code`; ผิดเกิน 5 ครั้ง/10 นาที → `RATE_LIMITED`) | `Order` (เฉพาะ pickup) |
| `GET/POST /api/shop/orders/:id/messages` | เหมือนฝั่งลูกค้า (sender=shop) · `CHAT_CLOSED` เมื่อออเดอร์จบ | |
| `POST /api/shop/orders/:id/messages/read` | – (ตั้ง `read_at` ให้ข้อความจากลูกค้า) | `{ unreadMessageCount: 0 }` |
| `POST /api/shop/push/subscribe` | `{ endpoint, keys:{ p256dh, auth } }` (จาก `PushSubscription.toJSON()`; upsert ตาม `endpoint`) | `{ ok: true }` |
| `POST /api/shop/push/unsubscribe` | `{ endpoint }` | `{ ok: true }` |
| `GET /api/shop/chats` | – | รูปแบบเดียวกับ `/api/liff/chats` (ของร้านฉัน) |
| `GET /api/shop/services` | – (ทั้งที่เปิดและปิด) | `ShopService[]` |
| `POST /api/shop/services` | `{ name, priceSatang\|null, unit }` (เกิน 20 รายการ → `VALIDATION_ERROR`) | `ShopService` |
| `PUT /api/shop/services/:id` | `{ name, priceSatang\|null, unit, isActive, sortOrder }` | `ShopService` |
| `DELETE /api/shop/services/:id` | – (ลบจริงได้ เพราะออเดอร์เก็บ snapshot) | `{ ok: true }` |
| `GET /api/shop/me` | – (`requireAuthUser`) | `ShopMe` |
| `POST /api/shop/register` | `{ name, phone, address, lat, lng, acceptsDelivery }` (`requireAuthUser`; สร้าง `shops` สถานะ `pending` + `profiles` role `shop` ในทรานแซกชันเดียว; หนึ่งผู้ใช้หนึ่งร้าน ซ้ำ → `ALREADY_REGISTERED`) | `Shop` |
| `GET/PUT /api/shop/profile` | `{ name, phone, address, lat, lng, acceptsDelivery, cutoffMinutes, isPaused }` | `Shop` |
| `GET/PUT /api/shop/hours` | `[{ weekday, openTime, closeTime, isClosed }]` (7 รายการ) | เหมือนกัน |
| `GET/PUT /api/shop/pricing` | `{ rules:[{ color,paper,sides,pricePerPageSatang }], tiers:[{ minPages, note }] }` | เหมือนกัน |

### 6.3 ชำระเงิน (`/api/payments/*`, เจ้าของ: อาร์ม)
| Method + Path | Request | Response |
|---|---|---|
| `POST /api/payments/orders/:orderId/charge` | – (เฉพาะ `awaiting_payment`) | `{ paymentId, amountSatang, promptpayPayload, qrDataUrl, expiresAt }` |
| `POST /api/payments/orders/:orderId/slip` | `{ slipPath }` (อัปโหลดผ่าน signed URL ก่อน; ขอ URL ที่ `POST /api/payments/orders/:orderId/slip/sign`) | `{ status: 'verified'\|'pending_review'\|'rejected', reason? }` |
| `POST /api/payments/orders/:orderId/slip/sign` | `{ mime }` | `{ path, uploadUrl, token }` |
ลูกค้าเรียกกลุ่มนี้ด้วย LIFF token เหมือนเดิม

### 6.4 แอดมิน (`/api/admin/*`, เจ้าของ: อาร์ม)
`GET /api/admin/shops` · `POST /api/admin/shops/:id/approve|suspend` · `GET /api/admin/orders?status=&q=` · `GET /api/admin/orders/:id` (`OrderDetail` ครบ รวม `deliveryRecipient*`) · `POST /api/admin/orders/:id/cancel` (`{ reason, refundSatang? }` จาก `paid|printing|ready|courier_requested|in_transit` → `transition` + refund; ไม่ส่ง `refundSatang` = คืนเต็ม `total_satang`, ส่งได้ไม่เกิน `total_satang`) · `POST /api/admin/orders/:id/complete` (`{ reason }` ปิดงานรับเองที่ค้างสถานะ `ready`) · `GET /api/admin/payments?status=pending_review` · `POST /api/admin/payments/:id/approve|reject` (`reject` ต้องมี `reason`) · `POST /api/admin/payments/:id/refund` (`{ reason }` ใช้เมื่ออนุมัติสลิปไม่ได้เพราะออเดอร์หมดอายุแล้ว → สร้าง `refunds` pending) · `GET /api/admin/settlements?status=` · `POST /api/admin/settlements/:id/mark-paid` (`{ proofPath? }`) · `GET /api/admin/refunds` · `POST /api/admin/refunds/:id/mark-paid` · `POST /api/admin/orders/:id/delivery` (กรอกผลการเรียกไรเดอร์ด้วยมือ: `{ status, feeSatang?, trackingUrl?, note? }`) · `GET /api/admin/overview` (ไม่บังคับ: `{ ordersToday, completedToday, platformFeeTodaySatang, platformFeeTotalSatang }`)
รูปแบบ response ของกลุ่มนี้ (นอกจาก `OrderDetail`) ไม่ใช่ข้อตกลงข้ามคน อาร์มกำหนดเองได้ แต่ต้องใช้รูปแบบ error ข้อ 1 และเงินเป็นสตางค์ · ตัวเรียกฝั่งหน้าจอแอดมินอยู่ใน `src/app/admin/_lib/api.ts`

### 6.5 อื่น ๆ
- `POST /api/line/webhook` (ซี) · `POST /api/delivery/webhook/:provider` (ซี)
- `POST /api/cron/expire-orders` (พลุ, ป้องกันด้วย `Authorization: Bearer ${CRON_SECRET}`) · `POST /api/cron/cleanup-files` (พลุ)

### 6.6 รูปแบบข้อมูลที่คืน
```ts
// หมายเหตุ: ฝั่งลูกค้า ถ้า requiresManualPrice และสถานะ submitted → estimatedPrintSatang/estimatedServicesSatang เป็น null (ห้ามส่งราคาให้ลูกค้าเอง) · ฝั่งร้านเห็นค่าจริง
Order = { id, orderNo, status, fulfillment, shopId, shopName, customerNote|null,
  requiresManualPrice, estimatedPrintSatang|null, estimatedServicesSatang|null, printSubtotalSatang|null, platformFeeSatang|null,
  deliveryFeeSatang, totalSatang|null, rejectReason|null, responseDeadline, paymentDeadline|null,
  pickupCode|null /* ส่งเฉพาะฝั่งลูกค้า เมื่อ fulfillment=pickup และสถานะ paid|printing|ready */,
  readyInMinutes|null, estimatedReadyAt|null, readyNote|null,
  unreadMessageCount /* จำนวนข้อความจากอีกฝ่ายที่ผู้เรียกยังไม่อ่าน */, createdAt, updatedAt }
OrderDetail = Order & { files: OrderFile[], services: OrderService[], payment: Payment|null, delivery: Delivery|null,
  deliveryAddress|null, deliveryRecipientName|null, deliveryRecipientPhone|null /* ไม่ส่งให้ร้าน */,
  shop: { id, name, address, phone } }
OrderFile = { id, originalName, mime, sizeBytes, pageCount, color, paper, sides, copies }
ShopService = { id, name, priceSatang|null, unit, isActive, sortOrder }
OrderService = { id, name, unit, unitPriceSatang|null, fileId|null, quantity, lineTotalSatang|null }   // lineTotal = unitPrice × quantity; null เมื่อยังไม่มีราคา
Message = { id, orderId, sender, body, createdAt }
Payment = { id, status, amountSatang, rejectReason|null, createdAt }   // ไม่ส่ง slipPath/slipRef ออก API
Delivery = { id, provider, status, feeSatang|null, trackingUrl|null, note|null, updatedAt }
Shop = { id, name, phone, address, lat, lng, status, isPaused, acceptsDelivery, cutoffMinutes }
ShopMe = { state: 'no_profile'|'pending'|'active'|'suspended', shop: Shop|null }
```

## 7. ฟังก์ชันภายใน (signature คงที่ ห้ามเปลี่ยนโดยไม่ถามซี)
```ts
// auth (ซี)  src/lib/auth
requireCustomer(req): Promise<{ customerId: string; lineUserId: string }>
requireAuthUser(req): Promise<{ authUserId: string; email: string }>   // ล็อกอิน Supabase แล้ว ไม่ต้องมี profile (ใช้กับ /api/shop/me และ /register)
requireShop(req, opts?: { allowPending?: boolean }): Promise<{ authUserId: string; shopId: string }>   // default: ร้านต้อง active · allowPending=true ให้ผ่านเมื่อ pending
requireAdmin(req):    Promise<{ authUserId: string }>

// pricing (พลุ)  src/lib/domain/pricing
estimate(input: { files: FileSetting[]; rules: PricingRule[]; tiers: DiscountTier[]; shopServices: ShopService[]; selectedServices: { serviceId: string; fileIndexes?: number[] }[]; fulfillment: Fulfillment; deliveryFeeSatang: number }): Estimate
calculateTotals(args: { printSubtotalSatang: number; deliveryFeeSatang: number; feeRate: number }): { platformFeeSatang: number; totalSatang: number }
formatBaht(satang: number): string   // "22.00" / "1,250.50"

// order (พลุ)  src/lib/domain/orders
transition(args: { orderId: string; from: OrderStatus|OrderStatus[]; to: OrderStatus; actor: 'customer'|'shop'|'admin'|'system'; patch?: Partial<OrderRow>; refundSatang?: number /* ใช้เมื่อแอดมิน →cancelled */ }): Promise<OrderRow>
isShopOpen(shop, hours, now: Date): { isOpen: boolean; opensAt: string|null; closesAt: string|null }
expireIfDue(order: OrderRow): Promise<OrderRow>   // พลุ P9: ตรวจ lazy-expiry ก่อนคืนออเดอร์ทุกครั้ง

// notify (ซี)  src/lib/line/notify.ts
notify(orderId: string, event: NotifyEvent): Promise<void>
// notifyShop (ซี) src/lib/push/notifyShop.ts — Web Push ไปเครื่องของร้าน (แม้ไม่ได้เปิดหน้า dashboard) · D17
notifyShop(shopId: string, event: 'order_new'|'chat_message', ref: { orderId: string; orderNo: string }): Promise<void>  // ห้ามโยน error ออกนอกฟังก์ชัน; ลบ subscription ที่หมดอายุ
NotifyEvent = 'quote_ready'|'order_rejected'|'order_expired'|'order_cancelled'|'payment_verified'
            |'payment_rejected'|'printing'|'ready'|'courier_requested'|'in_transit'|'completed'|'chat_message'|'eta_changed'

// payment (อาร์ม)  src/lib/payment
interface PaymentProvider {
  createCharge(args:{ orderId:string; amountSatang:number }): Promise<{ promptpayPayload:string; qrDataUrl:string }>
  verifySlip(args:{ slipBytes: Uint8Array; expectedAmountSatang:number }): Promise<{ result:'verified'|'rejected'|'review'; slipRef?:string; reason?:string }>
}
// delivery (ซี)  src/lib/delivery
createDeliveryForOrder(orderId: string): Promise<Delivery>     // ซี Z7: ใช้ provider ที่เลือก สร้างแถว deliveries (พลุเรียกจาก transition เมื่อเข้า courier_requested)
applyDeliveryUpdate(orderId: string, u: { status: DeliveryStatus; feeSatang?: number; trackingUrl?: string; note?: string }): Promise<Delivery>  // ซี Z7: อัปเดต deliveries + transition ไป in_transit/completed + notify (อาร์มเรียกจาก /api/admin/orders/:id/delivery)
quoteDelivery(shopId: string, dropoff: LatLng): Promise<{ feeSatang: number; estimated: boolean }>  // ซี Z7: พลุเรียกใน /estimate และ confirm
interface DeliveryProvider {
  name: 'manual'|'grab'
  getQuote(args:{ pickup:LatLng; dropoff:LatLng }): Promise<{ feeSatang:number; etaMinutes:number|null; estimated:boolean }>
  create(args:{ orderId:string; pickup:Place; dropoff:Place }): Promise<{ providerRef:string|null; status:DeliveryStatus }>
  cancel(args:{ providerRef:string }): Promise<void>
}
```
**กติกาแชท (D15):** ห้องแชท = ออเดอร์ละหนึ่งห้อง · ออเดอร์อยู่สถานะปลายทาง (`completed|rejected|cancelled|expired`) → ห้องปิดทันที: อ่านย้อนหลังได้ ส่งใหม่ไม่ได้ (`CHAT_CLOSED`) · ซิงก์ข้อความด้วย polling ไม่ใช่ WebSocket/Realtime (D15)
**กติกา `notify(orderId,'chat_message')`:** ส่ง LINE push หาลูกค้า **เฉพาะเมื่อเป็นข้อความจากร้านที่ยังไม่มีข้อความร้านก่อนหน้าที่ยังไม่อ่านในห้องเดียวกัน** (ร้านพิมพ์รัว ๆ ไม่ส่ง push ทุกข้อความ; พออ่านแล้วข้อความถัดไปส่ง push ใหม่) · ตั้ง `push_sent_at` เมื่อส่ง · ฝั่งร้านไม่มี LINE OA → แจ้งผ่าน `notifyShop()` (Web Push, D17) + ในหน้า dashboard (badge/เสียง/ชื่อแท็บ) ไม่ผ่าน `notify()`

เมื่อ `transition` สำเร็จ ฟังก์ชันเรียก `notify()` ตามตาราง state machine (พลุเรียก ซีเป็นเจ้าของ implementation; ช่วงแรกซีทำ `notify` เป็น no-op ที่ log ไว้ก่อน)

## 8. ตัวแปรสภาพแวดล้อม (ซีสร้าง `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_LIFF_ID` `LINE_CHANNEL_ID` `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` · `PLATFORM_PROMPTPAY_ID` `SLIPOK_API_KEY` `SLIPOK_BRANCH_ID` (ว่างได้) · `PLATFORM_FEE_RATE` `SHOP_RESPONSE_MINUTES` `PAYMENT_WINDOW_MINUTES` `DELIVERY_BASE_SATANG` `DELIVERY_PER_KM_SATANG` · `CRON_SECRET` · `NEXT_PUBLIC_APP_URL` · `NEXT_PUBLIC_USE_MOCK` `DELIVERY_PROVIDER` (default `manual`) · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` (server only) `VAPID_SUBJECT`
